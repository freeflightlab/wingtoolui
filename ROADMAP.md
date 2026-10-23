# Roadmap

The handbook has twelve chapters and two appendices. Phase 1 covers the ones
that form a closed loop from parameters to cutting files; the rest add depth,
accuracy and workflow.

Each phase is sized to be independently useful — the tool should be worth
opening at the end of every one, not only at the end.

---

## Phase 1 — geometry pipeline ✅ complete

Everything needed to go from numbers to a cutting file.

Every item below is checked individually by `tests/phase1-audit.mjs` — 81
checks that walk this list rather than the modules, asking whether each
completed claim is still true. The audit runs it and fails if any claim does
not verify.

- [x] Planform: elliptical + linear edges, discrete tables, area, AR, MAC, centroid *(ch.1)*
- [x] Sections: NACA 4-digit generator, coordinate import, surface splitting, metrics *(ch.2)*
- [x] Arc: circle / ellipse / bionic / imported, arc-length parameterised, washin *(ch.3)*
- [x] 3D assembly: both rotations, reference and rotation points *(ch.3.4)*
- [x] Longitudinal balance: full solve + legacy mode reproducing the worked example *(ch.4)*
- [x] Flat development: triangle-pair unrolling, distortion reporting *(ch.5)*
- [x] Ovalization: billow geometry, tapered widening, seam easing *(ch.6)*
- [x] Lines: weighted-centroid cascade, both load cases *(ch.8.1–8.2)*
- [x] Export: true R12 DXF, true-scale SVG, CSV, project save/load
- [x] Closed trailing edge, Selig and Lednicer import
- [x] Nesting with orientation search and skyline packing
- [x] Four live viewports
- [x] Third rotation about the vertical, aligning ribs to the glide path,
      with phi/chi diagnostics *(2021 study, supersedes ch.3.4)*
- [x] Line weight in the balance *(2020 equilibrium revisit)*
- [x] Laboratori d'envol .txt import, with intake read from the file header
- [x] Scale-invariant arc definition
- [x] 2566-test validation suite and a benchmark with regression budgets
- [x] Operating environment: U.S. Standard Atmosphere 1976 to 50 km, with
      Reynolds, Mach and Knudsen numbers and applicability warnings
- [x] Lifting line over the real planform — Oswald factor and span loading are
      now results, not typed-in assumptions
- [x] Wing polars, with best glide and minimum sink at any altitude
- [x] Reflex, applied to the camber line of any section
- [x] XFOIL interoperability: geometry and command export at the computed
      Reynolds and Mach number, polar import, condition-mismatch checking
- [x] Production line-table import, with cascade topology recovered from
      lengths alone

---

## Phase 2 — accuracy and the missing chapters

Newly identified from the author's wider site, which carries a decade of
material published after the handbook:

- [x] **3D shaping: dart geometry and placement** — `shaping3d.js`. Darts
      sized, spread, checked for folding, and cut out of the panel. See
      `docs/shaping.md`.
- [ ] **Derive the shaping requirement from the wing** — two attempts were
      wrong: developable distortion is 0.002% and the dihedral change per cell
      is half a degree. The driver is the doubly-curved nose, which needs the
      nose radius and surface curvature together. `shapingForWing` asks for
      the figure rather than guessing it.
- [x] **LEP file interoperability** — `leparagliding.txt` read and written,
      with all 33 unmodelled sections preserved byte for byte. Validated
      against the published gnuC2-27 (27.00 m² recovered from a file named
      for 27 m²). See `docs/lep-format.md`.
- [x] **Riser-based line plans** — rows and risers modelled separately,
      industry naming grammar, production line-table import, cascade topology
      and riser length recovered from lengths alone, junction placement
      calibrated against three real wings. See `docs/line-plans.md`.
- [x] **Brake cascade generation** — four levels with a single shared lower
      line, uneven tip-biased anchors, and engagement driven by a slack
      distribution rather than geometry. Structure matches the BGD reference
      exactly (13/6/3/1). See `docs/brakes.md`.
- [x] **Risers, speed system and the accelerated polar** *(ch.9)* — riser
      travel rotates the wing, the brake pulley couples to it, and the polar
      runs across the bar range. Validated against BGD's published Lynx 2
      figures on four independent quantities. See `docs/speed-system.md`.
- [x] **Lift curve derived from the wing** — section polar plus lifting line
      plus Reynolds iteration, replacing the last hand-fed input. Most of the
      validity range now falls out of the same calculation.
- [ ] **Predict the frontal-collapse floor** rather than assuming it. It is
      structural, not aerodynamic, and it governs predicted top speed at
      4.8 km/h per 0.05. Currently inverted from published speeds (implying
      Cz 0.307 on the Lynx 2); predicting it needs internal pressure and rib
      support modelling.
- [x] **Trimmers** *(ch.9.3)* — rear-riser lengthening, composed with the
      speed system. The shortenings add but the angles do not quite, and the
      combination can leave the flyable envelope when neither control alone
      does. See `docs/speed-system.md`.
- [x] **The riser is webbing, not a line level** — corrected throughout after
      the PMA standard was read properly. The deepest cascade level is now
      `main`; the riser runs from the maillons to the karabiner, steps between
      sizes, and has its own assembly and mass. See `docs/inspection.md`.
- [x] **PMA worked example validated** — `pma.js` already implemented the
      standard; its Appendix A example had never been run against it. All 28
      deltas and all eight flagged lines reproduce exactly.
- [x] **PMA data exchange** *(§6.2.1)* — the record a manufacturer hands an
      inspection company, produced from the design. Sewn length rather than
      cut length, totals including the riser and trimmer position, and an
      incomplete record marked as such.
- [x] **B-handle and C-handle geometry** — `handleGeometry` and
      `handleAgainstBrake`. The lever is the anchor separation along the
      chord, which `alphaChange` already knew; the B handle's shorter lever
      gives twice the effect of the C. A brake needs three times the travel
      to reach the same angle and adds 6.9% of chord in camber doing it. See
      `docs/risers.md`.
- [x] **Line loads under acceleration** — this item was wrong twice over.
      `rowShareMode: 'pressure'` has derived the shares from the section since
      Phase 2, so `loads.js` did not assume trim; and the load moves **aft**
      on the bar, not forward. The A row sheds 27% of its share between trim
      and full bar while D gains a quarter, which is why rear-riser steering
      works accelerated and why C and D must be sized for it. Now asserted.
- [ ] **Collapse and stabilo lines** — the `Z` row on the Lyght; parsed, not
      generated.
- [x] **Load distribution through the cascade** — lifting-line lift to load
      per rib to tension per line, closing exactly on half the wing load.
- [x] **Line materials and diameter selection** — 78 measured line types with
      both new and kinked breaking strengths; selection sizes on the kinked
      figure, which is up to 52% lower. See `docs/loads-and-materials.md`.
- [x] **Elastic stretch correction** *(LEP section 18)* — cut lengths shortened
      so each line flies to its design length.
- [x] **Line drag computed from the lineset**, replacing the constant the
      balance solver has used since Phase 1. Worth about 1.6 of glide ratio on
      a modern thin set.
- [x] **Chordwise pressure distribution** — row load shares derived from
      thin-aerofoil theory for the actual section, anchors and angle of
      attack. Agrees with the handbook convention on A and C, disagrees on the
      rear, and shows the A row swinging 20 points across the bar range where
      the fixed split cannot. Convention remains the default; see
      `docs/loads-and-materials.md`.
- [ ] **Reconcile the rear-row disagreement** — thin-aerofoil theory loads a
      rigid surface to the trailing edge and gives the D row ~17%, where the
      convention gives 10%. A paraglider's rear rows are deliberately unloaded
      so the C and D lines can be thin; quantifying that needs measured riser
      loads.
- [x] **Row shares under acceleration** — `loadEnvelope` sweeps the speedbar
      and sizes each line for the worst case in the flyable range. 78 of 104
      lines are governed away from trim; the D row gains 46%. The sweep stops
      at the collapse floor, where the A row unloads.
- [x] **Gust load factor**, connecting speed to the design case: a 7.5 m/s
      gust gives 7.4 g at trim and 11.0 g at full speed, bracketing the 8 g
      certification test.
- [x] **Gust alleviation** — Pratt-Walker, which cuts a paraglider's gust
      case by 10.2x because its mass ratio is so low. The sharp-edged figure
      exceeded the 8 g certification case; the alleviated one is well under
      it, so gusts do not govern the design. Flagged as an extrapolation:
      Pratt-Walker was fitted for mass ratios of 5 to 100 and a paraglider is
      0.67.
- [x] **Pratt-Walker checked from first principles** — `gustResponse`
      integrates the equation of motion with nothing fitted. It agrees to 3%
      at mu = 6, inside the fitted range, and diverges by 16% at a
      paraglider's 0.67 — with Pratt-Walker the conservative one there. The
      integration is quasi-steady and says so.
- [ ] **Unsteady lift in the gust response** — the integration takes lift as
      following angle of attack instantly. The Kussner lag would tighten the
      comparison at low mass ratio.
- [x] **Asymmetric and collapse load cases** — a tip collapse sheds far less
      lift than its span fraction (25% of span sheds 16% of lift), and a
      frontal collapse moves the A row's load onto C. Half the span gone, with
      a dynamic factor of 1.5, works the remaining lines 2.5 times as hard as
      level flight.
- [x] **The collapse envelope, corrected** — it put that multiple ON TOP of
      the 8 g limit and its margin (30 times level flight in every line) and
      concluded that "collapse governs every line". Each case now carries its
      own load factor: a collapse in level flight governs nothing, and would
      have to come at 3.1 g to size a line (`governingCollapseG`).
- [x] **Reconciliation with a real lineset, redone** — the old one compared
      that 30x with "28x on PHI's most load-critical line", a literal in the
      test file. Computed from PHI's own sheet (`publishedCascadeLoads`,
      `strengthFactors`) the hardest-worked line is at 8.7x its level-flight
      load on kinked strength (7 to 11 with the row split varied; 13 to 20 on
      new strength), and half the 62 lines are under 30x. The wing is built to
      about the symmetric case.
- [x] **Practical minimum diameter** — neither PHI nor Ozone uses line below
      0.50 mm, and it is handling rather than strength that stops them. With
      the floor in place most of a lineset is floor-sized, not load-sized, and
      `selectLines` reports which.
- [ ] **Measured line loads** — every strength factor above rests on a
      modelled split between the rows, and the answer moves by a third with
      it. Riser loads measured on one wing would settle it. The collapse
      dynamic factor is still a stand-in too, though it no longer decides any
      line.
- [ ] **Brake cascade decoding** — the PHI sheet's brake block lists each upper
      line twice, plain and with the spanwise distribution added, so its
      columns do not map one-to-one onto names. Needs the pulley geometry.
- [x] **Wake interference between lines** — measured rather than assumed.
      Only 15 of the test wing's 48 lines a side are genuinely inside
      another's wake once the wake width is taken properly, against 36 by a
      naive proximity test. Worth 5% of line drag and +0.05 of glide. Off by
      default.
- [ ] **Wake merging and unsteadiness** — the model takes a single upstream
      shielder and a steady far-wake profile. Several lines shielding one, and
      the unsteady vortex street, are not represented.
- [x] **Size-family scaling**, validated across three families from two
      manufacturers (18 sizes, 12.9-29 m²). Canopy scales isometrically
      everywhere; line length and mass are affine everywhere; but the
      coefficients vary by ~1.7x between families, so they must be fitted per
      family and isometric is the default. See `docs/scaling.md`.
- [x] **Application-aware comparison** — wings classified by brief (hike and
      fly, progression, sport, performance XC, competition); cross-class
      comparisons flagged with an explanation rather than silently made, and
      metrics normalised per m² so size does not masquerade as design.
- [x] **BGD line tables** — a fourth format, and the only one that states its
      own cascade. Used as ground truth: the length-only topology inference
      recovers BGD's stated branching on all four rows exactly, which is the
      only direct check available on the method used for the Ozone sheets.
- [x] **Wing loading against aspect ratio** — rises across the mainstream
      progression at r=+0.99, with hike-and-fly wings excluded by design
      rather than trimmed as outliers.
- [x] **Viewport fitting** — drawings re-fit their viewBox to what was
      actually drawn; the cutting layout wraps into bands (4% to 91% of frame
      height); and charts now use independent axes, taking the polar from 1.6%
      of frame width to filling it. See `docs/viewports.md`.
- [x] **Pan and zoom** on the section and rib views, defaulting to the fit and
      surviving a redraw.
- [x] **Single-rib view** with a rib selector, showing the cut pattern with
      seam allowance, intake and anchors, on its own tab.
- [x] **Rib internals in the rib view** — lightening holes drawn from the
      same rules the export uses.
- [x] **Alpina 5 specifications** — six sizes added, giving a five-family,
      three-manufacturer scaling sample.
- [x] **Lynx 2 specifications** — BGD joins as a sixth family and third
      manufacturer, out of sample. Against the sums of BGD's own line sheets
      the aspect-ratio line-length law is 6.6 to 7.5% under at every size.
- [x] **"BGD scales its lineset with area" — withdrawn.** That was BGD's
      published "Total line length" row, which is 10.7 m per square metre at
      every size; its line sheets, in this repository all along, go with the
      linear factor BGD state. All seven families scale with span (exponent
      1.02 to 1.30). `size-families.tsv` holds the sheet sums now and
      `published-specs.tsv` the published row.
- [ ] **Collapse-line (Z) risers** — the Zeno 2, Lyght and Alpina 5 all carry
      a Z row on its own riser, structurally unlike the three-riser wings
      modelled so far. Parsed and named; not generated.
- [x] **Separate aspect ratio from span** — done with a matched-span pair.
      At equal riser count and spans within 5%, a 17% higher aspect ratio
      carries 9% less line per metre of span; at matched aspect ratio a
      two-liner carries 10% less than a three-liner. The normalised law
      `line m per m span = -5.12*AR + 50.72` predicts any family's total line
      length within 6.2% with nothing fitted to it.
- [x] **The two-liner effect, tested and refuted** — Skywalk's SAGE, a genuine
      two-liner at AR 6.4, matches the uncorrected line-length law; applying
      the 0.90 factor makes every size 9% low. The factor is now inert, kept
      with its contradiction recorded.
- [x] **Why the line-length law looked affine** — Ozone's Enzo 3 CCC check
      states it: lines scale proportionally and risers are not scaled. A
      length quoted including a riser looks affine, with the intercept being
      the riser. Skywalk's riser-free figures need a fixed part of 0 mm.
- [x] **Documentation figures** — generated from the project's own modules
      and data by `tools/make-diagrams.mjs`, so they cannot drift; checked for
      validity and for dangling references.
- [x] **UP Paragliders line sheets** — a sixth naming convention with four
      cascade levels, roman numerals and `main` names; legacy `.xls` read
      directly since xlrd is unavailable. Five wings, 29 sheets.
- [x] **Loop allowance in cut lengths** — UP is the only maker to state it,
      and it is 13% of all line material and 37% of the shortest line.
- [x] **Prefix-level naming and combined rows** *(Advance TAU DLS)* — the
      level as a prefix, resolved relative to the wing's cascade depth, and
      merged rows whose load is the sum of the rows they serve. A single-row
      reading of `2AB2` understates it by 2x.
- [x] **Merged rows in the line plan generator** — `mergeRows` shares a
      cascade between two rows below their top lines, cutting line drag 43%
      on the test wing, and exposed in the interface. Combined names round
      trip through the parser.
- [ ] **Trimming a merged cascade** — merging removes the independent
      adjustment of the rows it joins, which is a real handling cost the tool
      does not represent.
- [x] **Residuals of the line-length law**, computed across all seven
      families. Riser count is worth about 2 points, not the 10 once
      proposed; cell count pushes in the right direction at r=0.2 but
      explains little.
- [ ] **What separates the Alpina 5 from the Allegro light** — still 9.7
      residual points apart at aspect ratios within 0.04. Neither riser count
      nor cell count accounts for it.
- [ ] **Why the Lynx 2 carries more line than its aspect ratio suggests** —
      the largest residual, +7.8%, and the same at every size. It is the only
      2.5-liner in the set; whether that is the cause is untested.
- [ ] **Line count as a scaling parameter** — the total-line-length slope
      tracks how many lines a wing carries (258 pieces on the Ultralite 5
      against 224 on the Geo 7). Normalising by piece count may recover a
      transferable law; on the Geo 7 the mean length per piece divided by span
      is constant to 0.0025, but on the Ultralite 5 it drifts by 0.011 across
      a near-doubling of area.
- [x] **Scale a full design, not just its summary numbers** — `buildFamily`
      runs geometry, panels, nesting, balance, lines and sizing per size. The
      load-sized fraction rises 10% to 19% across the Geo 7 family, line mass
      per m² rises, and line drag barely improves because the practical floor
      caps it. See `docs/scaling.md` §6.
- [x] **Per-size line sizing** — each size sized from its own loads, which is
      what makes the load-sized trend above visible.
- [ ] **Discrete hardware** — riser length and speed-system travel step
      between sizes (570/600 mm, 150/180 mm) rather than scaling. Needs a
      table, not a law.
- [ ] **Left/right and asymmetric plans** — quantities of 2 and 4 already
      encode mirror pairs; asymmetric line or colour plans do not yet exist.
- [ ] **Riser hardware** — maillons, pulleys, speed-system travel and trimmer
      geometry, feeding the calage variation study (LEP section 28).
- [x] **Total line lengths imported** — `tools/import-niviuk-totals.mjs`,
      all six Hook 6 sizes, cross-checked against the printed page. These are
      the PMA measurement, sail to harness, and what `comparePlans` needs.
- [x] **Reference wing comparison in the interface** — six measured Hook 6
      sizes embedded in the bundle, selectable, and diffed against the design
      as it is drawn. Mean offset and shape deviation reported separately,
      because they mean different things.
- [x] **The whole Niviuk range in the comparison library** — 25 sizes across
      five wings, row labels read from each table's own header so the
      single-surface Skin 4 P keeps all nine of its rows. Cross-checked
      against the printed pages.
- [ ] **Ozone and PHI totals** — several of those sheets carry a
      total-line-length table too, in their own formats.
- [ ] **Read the remaining LEP sections into the model** — 9-11 (the line
      cascade matrix, richer than this project's centroid method), 12 (V-ribs),
      29 (3D shaping), 34 (line characteristics), 35 (equilibrium inputs).
      All are round-trip safe today; mapping them into the model is next.
- [ ] **Reference wings from the gnuLAB / gnuA / BHL series** — dozens of
      complete published designs with airfoils and areas, usable as both
      starting points and validation cases.


The parts the source describes but Phase 1 skipped, plus the accuracy work the
validation notes flagged.

- [x] **Diagonal ribs** *(ch.7)* — reconstructed from the figures. Fan
      geometry developed exactly (a cone is developable, error 4e-16), the
      load path checked by the fact that half the load must travel diagonally
      when lines attach every second rib, and unsupported span detected when
      diagonals cannot reach. See `docs/diagonal-ribs.md`.
- [x] **Diagonal cutting files and display** — nested R12 DXF on their own
      roll, drawn on the rib they touch, with unsupported span warned in the
      status bar.
- [x] **H-ribs** *(ch.7, LEP section 12)* — internal sheets holding the cell
      to its intended width, developed as strips rather than cones, and
      combined with the V form through `internalStructure`.
- [x] **Corrected the panel distortion measure** — it had compared a length
      the unrolling preserves by construction, so it reported machine
      precision on every wing since Phase 1. See `docs/validation.md` §2.3.1.
- [x] **Responsiveness audit** — 26 reported metrics swept against the inputs
      they claim to depend on, checking each moves by a meaningful amount in
      the right direction. Added because the panel distortion measure passed
      every one-sided check for months while unable to return anything but
      zero.
- [ ] **VH-ribs** — the combined form; LEP section 12 carries all three.
- [x] **Diagonals as structure** — `diagonalTension` and
      `checkDiagonalTension`. Fabric carries tension only, so a fibre past 90°
      from the load goes slack. A narrow diagonal works across its whole
      width; at 45% base spread only 58% of it does, while paying for six
      times the fabric. See `docs/diagonal-ribs.md`.
- [ ] **Risers and speed system** *(ch.9)*. Four-riser geometry, travel of each
      riser under acceleration, and the resulting change in calage — which
      makes the balance solve a curve over the speed range rather than a point.
- [ ] **Trimmers and the accelerated polar.** Re-solve equilibrium across the
      speed system's travel and plot speed against sink.
- [ ] **NACA 5-digit and modified 4-digit sections**, matching the generator
      this project was cross-checked against.
- [x] **The polar fed back into the balance** — `solveEquilibriumFromWing`
      derives Cz from the section lift slope and zero-lift angle, Cm0 from the
      section, and the Oswald factor from lifting line over the real planform.
      Camber now moves trim speed by 4 km/h and the calage by 11%.
- [x] **Riser-aware line plans.** `RISER_LAYOUTS` puts four rows on three
      risers, and `applyRiserSplit` adds the split A that every Niviuk in the
      reference set uses. Exposed as a control. See `docs/risers.md`.
- [ ] **Per-rib balance.** The current solve treats the central section as
      representative, as the handbook does. Solving spanwise would let washin
      and taper feed back into trim.
- [x] **Ovalization from pressure**, rather than a flat 6%.
      `billowFromPressure` closes the loop and `applyOvalization` takes a
      `pressure` option, with the panel's own width supplying the spacing.
      Peak billow moves from 13% to 9% chord. See `docs/departures.md`.

---

## Audit

- [x] **Riser webbing in the geometry** — the cascade fanned out from the
      karabiner itself, a main line sitting 48 degrees from vertical for its
      whole length. The fan starts above the risers now, and each riser lies
      along the resultant of its own lines' tension (hung vertically first,
      then pointed, one pass). See `docs/risers.md`.
- [x] **The Swoop2 rods checked against its own program** — 50 rods a side
      in 2 blocs, not four times that: a nose rod is one piece round the
      leading edge, and bloc 2 is a batten along the upper surface (it was
      carried as undecoded until the program was read). All 50 come out at
      their printed length. See `docs/rods-validated.md`.

- [x] **A free body check** — `freebody.js`. Weight, lift, drag and line
      tension as one body in gravity, with the geometry checked against the
      balance rather than only against itself. See `docs/free-body.md`.
- [x] **Flat lines at the tip** — reported as 12 of 99 lines running nearly
      spanwise. Measured from vertical, an outboard line looks flat because
      its rib leans with the arc; what matters is the angle from the way its
      anchor is pulled, in the rib's own plane. The flattest line of the
      suite's wing is 84 degrees from vertical and 42 from its rib, carrying
      three quarters of its tension along the load; none of its 44 top lines
      is past the 60 degree limit (the furthest is 46). The free body measures it that
      way now. See `docs/free-body.md`.
- [x] **Diagonals attach seam to seam** — and always did: a `buildVRibs`
      gusset runs from a point on the lower seam of a rib with a line to a
      run of the upper seam of the rib beside it, and two from one anchor are
      the V. `buildSeamDiagonals` gives the same V as two straight legs. The
      claim that gussets landed "in the middle of a panel" was wrong and is
      now a test.
- [x] **Diagonal leg asymmetry** — was "4.3 to 1, because of sweep"; that
      was the inside-out canopy. On the corrected wing the legs differ as the
      cells either side do: 1.04 at the root, 1.34 at the last rib.

- [x] **Lines in the 3D model as tubes at their real diameter** — OBJ
      polylines are optional and most importers drop them, so the cascade was
      in the file and invisible. Each line is now a swept tube at the
      diameter its selection chose. See `docs/cad-export.md`.

- [x] **OpenGlider reviewed** — see `docs/openglider.md`. Its mini-ribs are
      the concrete gap; its panel method and FEM are separate projects, not
      libraries to borrow.
- [x] **LEP section 12 read** — the Swoop2 carries 124 H/V/VH ribs and this
      tool was reading none of them.
- [x] **Mini-ribs built** — the Swoop2's 70 type-11 H ribs are constructed
      from its own file, 3116 cm2 of cloth that was being ignored. Types 15
      and 16 are counted and reported as not understood rather than guessed.

- [x] **Chord fraction was array index in three places** — the billow
      profile, where a diagonal attaches, and where every line attaches. The
      first was found because clustering points for the CAD export made the
      seam ease stop converging; the other two by looking for the pattern.
      See `docs/departures.md`.

- [x] **CAD export** — the wing as OBJ: both surfaces, the ribs and every
      line in named groups sharing one vertex pool. STL cannot carry lines
      and STEP is a hand-written entity graph that opens as nothing if it is
      slightly wrong. See `docs/cad-export.md`.

- [x] **Light mode, viewport export and a parameter table** — colours mapped
      at one point rather than at every call site; SVG and PNG on every
      viewport; every setting and derived figure as one table, with view
      preferences left out. See `docs/viewports.md`.

- [x] **Odd cell counts are reported, not rounded away** — the Alpina 5 and
      Lynx 2 have 65 cells, which this model cannot build. Found by building
      every reference wing and comparing it with its published figures rather
      than checking components against each other.
- [x] **A true centre cell** — a cell can now straddle the centreline, so an
      odd cell count is buildable. The Alpina 5 and Lynx 2 build their
      published 65. The centre cell is developed as its own panel, which
      walking consecutive ribs missed entirely: a 65-cell wing came out with
      64 cells' worth of cloth. See `docs/reference-wings.md`.

- [x] **The reference set checked against the manufacturers** —
      `published-specs.tsv`, transcribed separately so the two can disagree.
      72 figures across the Ultralite 5 and Geo 7, zero disagreements.
- [x] **The Swoop2 works as a complete design** — every view and all 30
      exports run on it, 17 files, asserted in the interface test.
- [ ] **The other nine families checked against their makers** — only the
      Ultralite 5 and Geo 7 are covered so far.

- [x] **The outboard diagonal collapses towards the tip** — 75 mm by rib 12,
      because the rib tilt cancels the cell gap. `minLengthM` skips them,
      halving the size spread; off by default because it can leave a rib
      unsupported. See `docs/diagonal-ribs.md`.

- [x] **The diagonals view drew every fibre red** — it measured the load
      against the diagonal's own axis rather than the line. No test could see
      it: the drawing was checked by element count and the stub DOM threw
      attributes away. The stub records them now and the colours are checked.

- [x] **Does it sew?** — every panel checked against the ribs it is sewn to,
      and against its neighbour: 0.006 mm worst. The front view is
      dimensioned and its figures held to the model's. See `docs/panels.md`.

- [x] **Dimensioned drawings** — span, chords and sweep on the plan; chord,
      maximum thickness and every anchor position on the rib. The labels are
      read back and checked against the model, because a drawing that
      disagrees with the design is worse than one with no labels. See
      `docs/viewports.md`.

- [x] **The arc validated against 38 published wings** — the projected-span
      ratio was an input nobody checked came back out. Exact on all 38. Two
      wrong measurements on the way, both pinned: the samples run past the
      half-span, and `at(s)` returns an object rather than a pair.
- [x] **Line optimiser and trim drift reachable** — both were built, tested
      and had no path to a user. Now a "Line set & trim" export, and
      `check-options` asserts a named list of user-facing capabilities stays
      reachable.
- [x] **A check that cannot fail is now itself checked** —
      `tools/check-assertions.mjs`, a stage.

- [x] **Rods on the rib** — rods had their own viewport showing a bare
      aerofoil, which is a second poorer rib view; a rod alone says nothing.
      They draw on the real rib now. (This entry went on to describe a nose
      rod as two extents, one on each surface. That reading was wrong: see
      "Rods built as the design's own program builds them", below.)

- [x] **A checkout doctor** (`npm run doctor`) — a first user's build failed
      with seven modules missing because they had cloned the old flat layout.
      The build could only report what it needed itself. `doctor` checks the
      whole tree and says what to do; it is now the first check stage, and the
      build's own message names the flat case and says it cannot be repaired
      by adding files.

- [x] **Line-set optimisation for a given load** — `optimiseLineSet`. Picking
      the best material per line needs seven types across three suppliers,
      which no workshop builds. Choosing N types is a one-dimensional
      k-segmentation and dynamic programming solves it exactly: four types
      cost 1.0% of drag against a different line at every anchor. (Real
      linesets use 3 to 16 types, almost all from two makers:
      `docs/line-sets.md`.)
- [x] **Trim drift and the check schedule** — `trimdrift.js`, rewritten
      2026-10. It said Dyneema creeps longer under load and aramid shrinks,
      and that one fibre throughout holds its trim. The makers say the
      reverse of the first: a Dyneema line settles shorter in its first 20 to
      50 hours, the lightly loaded rear lines most, and aramid hardly moves.
      Fibres are now read from the suppliers' own sheets (most of the
      catalogue had been filed under the wrong one), a line's working load is
      level flight against its new strength, and an attachment point moves
      by the sum down its path. Sizes are estimates and say so. See
      `docs/line-sets.md`.
- [x] **Custom cascade specification** — `parseCascadeSpec` reads the format
      a manufacturer sheet uses (`A 30 14 3`), builds exactly that, and writes
      a built plan back out. Two defects fixed on the way: `mainsPerRow` said
      per row and was one integer for all of them, and `chunkInto` returned
      g-1 groups whenever the division was inexact. See `docs/line-plans.md`.
- [x] **Fabric by location** — `fabric.js`. The bill carried four cloth
      weights; a real specification names nine materials. The nose takes a
      hard finish because it must hold its shape unpressurised, and the tool
      refuses a soft one — or a sail heavier than its ribs. Niviuk's own
      schedule is in the reference set.

- [x] **Inspection check on a design** — `lineGeometryCheck` had been tested
      against the standard's worked example and never against a real wing.
      The Enzo 3's six inspection sheets pass it with a 2 mm correction offset
      at worst, against a 118 mm limit. Now a button. See
      `docs/inspection.md`.

- [x] **Material selection** — the 78-material catalogue was in the repository
      and unreachable; the model used a built-in table of 21. `lineTableFor`
      and `materialBrands` expose it, and the brand picker is in the tool.
      Buying from one supplier costs 18 to 36% more line drag, and a
      four-material catalogue cannot size every line. See
      `docs/loads-and-materials.md`.

- [x] **Size family from the interface** — `buildFamily` had existed since
      Phase 2 with no way to ask for it. Now a control group and a button.
      Fixed on the way: a declared base area that contradicts the base
      geometry scaled every size 1.8% over, and is now refused — but only
      when the base area is used for scaling. See `docs/scaling.md`.

- [x] **A Structure view** — diagonals and rods were computed and never
      drawn; the Structure tab shows diagonals shaded fibre by fibre for
      tension, and rods are on the rib. (The "rods as chord-range groups"
      this entry also announced — `rodGroup`, `buildRodGroups` — were the
      misreading of section 21 and are gone. See `docs/rods.md`.)

- [x] **Every dataset measured, not just parsed** (`tools/corpus-learnings.mjs`)
      — 86 of 116 reference files reached nothing stronger than a physics
      check. `ANCHOR_DENSITY` held six hand-entered Ozone designs while the
      corpus had 25 across six makers. The corpus AGREES with the original
      figures and widens the three-riser sample from 3 designs to 19. Now a
      check stage, so a constant cannot drift from its data.

- [x] **Options passed that a function never reads** (`tools/check-options.mjs`)
      — four defects came from that shape, most seriously a bill of materials
      built with **no line data** because the interface passed `plan` and
      `selection` where `buildBOM` expects `linePlan` and `lineSelection`.
      Now a check stage, verified by reintroducing a bug.

- [x] **Split A risers, and a riser-aware plan** — `A-A'/B/C` and
      `A-A'/B` added, the layout exposed as a control with the split
      position beside it, and the riser drawn in the Lines view and listed in
      the cascade table. Every Niviuk in the reference set is a split-A wing
      and the tool could not draw one. See `docs/risers.md`.
- [x] **A phantom in the validation set** — the corpus reader routed
      `magnum4` and `vibegt`, neither of which had ever been committed.
      Family names are now asserted to have files.
- [x] **Vibe GT, Magnum 4 and Enzo 3 folded in** — they were supplied all
      along. `tools/read_xls.py` reads the old OLE2 format and all three are
      the modern zip format, so it refused them and they sat unconverted.
      `tools/read_xlsx.py` opens them: 15 sheets, 21 wings in the set now. The
      Magnum 4 is the first five-row wing and the first tandem; the Enzo 3 is
      a PMA inspection record that puts 353 of 354 measured lines inside the
      +/-12 mm band.

- [x] **Controls grouped by subject** — 30 of 74 sat in one group. Now nine
      groups; splitting them exposed three settings bound twice, one with
      option values the model does not accept. The interface test asserts one
      control per setting and none unreachable.

- [x] **Assumptions exposed as controls** — 33 of 75 numeric defaults in core
      modules could not be reached from the interface. The design decisions
      among them are now settings, each asserted to change both the model and
      an exported file. See `docs/assumptions.md`.
- [x] **`M.loads` was never assigned** — read in three places, computed in
      none, so the rib-stress report and the Lines table load column had
      always shown nothing.
- [x] **Two line models, one export using the wrong one** — `linesCSV` read
      the chapter 8 cascade while everything else used the line plan.
- [x] **A test depending on a file outside the checkout** — the interface
      test read a LEP sample from `/tmp`. It now reads the committed Swoop2.

- [x] **Swoop2 imported and validated** — Laboratori d'envol's own 18 m2
      design, LEP 3.30p. Flat area, span, chord, cells and ribs all reproduce
      exactly, and 37 sections parse where the reader was documented for 8.
      See `docs/swoop2.md`.
- [x] **Prefix levels count in opposite directions** — Advance numbers from
      the canopy, LEparagliding from the riser (the PMA convention). The
      parser assumed Advance and inverted every LEP cascade.
      `detectPrefixDirection` reads the direction from the geometry rather
      than the naming.
- [x] **Loads validated against the Swoop2** — the published per-line loads
      close at every cascade level, and its three-riser shares found a real
      bug: the four-row convention table was returned unchanged for
      three-row wings, assigning 10% of the load to a D row that does not
      exist. Renormalised, it matches the published shares within a point.
- [x] **A DXF reader** — `parseDXF`, exact on a known shape. The tool had
      written DXF since Phase 1 and never read one back.
- [x] **The 3.24x area discrepancy explained** — the reader was treating a
      POLYLINE's mandatory origin elevation point as a vertex, enclosing a
      wedge back to (0,0) whose size varied with distance from it. The export
      was correct; round trip now matches to 0.000005%. Every exported DXF is
      read back in the interface test.
- [x] **Outline reconstruction from loose segments** —
      `outlinesFromSegments`, exact on known shapes and on this project's own
      50 panels exploded into 2,400 shuffled segments. Stops at junctions
      rather than guessing.
- [ ] **Separate the Swoop2's panels from its marks** — reconstruction does
      not crack that file: everything is on one layer with shared endpoints,
      and only 75% of points join exactly two segments. Needs spatial
      clustering, not graph walking.

- [x] **Every wing held to the physics** (`tests/reference-sweep.mjs`) — 56
      line sheets against five invariants, not just against the parser. 74 of
      103 reference files had been reached by nothing stronger than "does it
      parse". It found a real bug on the first run: UP's Meru sheets order
      their columns differently, so every Meru line was being read as "2 mm"
      — the quantity column. Column positions now come from the header.
- [x] **Multi-size sheets split** — `splitMultiSizeSheet`, three files into
      twelve per-size sheets, all checked against the physics. A size named in
      the header but absent from the rows is reported rather than filled. What
      a sheet measures is now a `# measure:` key rather than prose.

- [x] **The stub DOM no longer lies quietly** — five methods returned empty
      unconditionally, and two checks had already been defeated by them: a
      button test that reported "0 pressed, none threw" as a pass, and a
      line-plan test that failed a working view. `querySelectorAll` and
      `querySelector` are now implemented against a registry of created
      nodes, the DOM is seeded from the real markup rather than a hand-written
      id list, and the rest throw. The interface test now verifies every tab
      has a matching viewport — checked by breaking it.

- [x] **A Lines view** — the cascade drawn as a rigging diagram, coloured by
      row, with a row filter and a table of every line's level, length, load
      and material. The cascade model had been built since Phase 2 and was
      never drawable.

- [x] **Niviuk added: a sixth manufacturer, 17 sizes, 4 families** — the
      line-length law, fitted without any Niviuk data, holds on their
      conventional wings within 20%. It fails on their single-surface wings by
      26 to 44%, and the reason is structural: a Skin 4 P and a Hook 6 of the
      same 20 m2 differ by 69% more line and 68% less weight. A single-surface
      wing has no internal structure, so the lines carry all the shape.
- [x] **Niviuk line sheets imported** — `tools/import-niviuk.mjs`, five
      wings, 546 lines, nothing dropped. Two parser gaps fixed on the way: a
      prefixed brake row read as a combined pair (seven lines lost per sheet),
      and rows stopping at E when a single-surface wing runs to I.
- [ ] **A line-length law for single-surface wings** — the existing one is
      fitted only on double-surface wings and under-predicts these badly.

- [x] **The interface test presses real buttons** — it used to call the export
      functions directly, which tests the functions and not the wiring. Two
      things had survived that gap: a duplicate `Panels DXF` button whose
      plain version shadowed the marks-aware one, and a bill of materials with
      no button at all since Phase 3. The stub DOM's `querySelectorAll` also
      returned `[]` unconditionally, so no button test could ever have worked.
      Buttons are now collected where they are created, pressed, and checked
      for duplicate labels. Folded into `tools/check.mjs`.
- [x] **Settings are checked against the files they produce** — five probes
      toggle a setting, press every button and compare what `save()` wrote.
      A first version watched the export helpers instead and reported a false
      failure, because `__exports().marked` calls the marked writer whatever
      the setting says: the same mistake as testing functions instead of
      buttons, one round later. Verified the probe can fail.

- [x] **Full-pipeline validation** (`tests/full-pipeline.mjs`) — all 55
      published sizes through every stage, checked against each other and
      against physics. Found four defects every module test passed: a
      square-rooted area ratio used as a span ratio (19.5% out on every wing),
      anchor density driven by cell count (inverting the aspect-ratio/drag
      relationship), anchor loads grouped by index rather than rib (12% of the
      wing's weight lost), and an unknown layout name silently defaulted.
      See `docs/full-pipeline.md`.
- [x] **Cascade junction and line height measured, not assumed** — the
      second junction was at 0.78 against a measured 0.860. The pipeline's
      line height, 0.464 x span, was the length of one main line and a sixth
      short of a path; it uses the published heights' law now.
- [x] **`recoverLevelFractions`** — reads the cascade junction back from any
      real line table. It is a design parameter spanning 0.786 to 0.925, not
      a constant.
- [ ] **The two-liners' bridle level.** Built with their own anchors and
      line height, the three-liners come within a tenth of their sheets (Geo
      7 MS +7%, Ultralite 5 19 -8%) and the two-liners a third over (Alpina 5
      ML +32%, Zeno 2 ML +34%). Each Ozone two-liner carries sixteen short
      bridles a side, A1a to A8b, gathering pairs of A attachments just below
      the sail: a level the generator does not build. (This item said the
      reverse once — "not a missing fourth level, all five wings run three" —
      counting levels by their names, which call a bridle an A line.)
- [x] **Minimum sink was outside the flyable envelope** — the polar is flat
      past CL 1.0, so the search put the minimum at CL 1.37 and 24 km/h.
      `maxUsableCL` caps it; glide is unaffected. Not a profile-drag error:
      doubling it moves sink toward reality and glide away from it.
- [ ] **A residual in minimum sink** — 0.83 m/s at the default cap against
      about 1.0 for a real wing of the size, 17% low (10% at a cap of 0.75).
      Trimmed from the calage instead of an assumed angle (`trimFromCalage`)
      it closes on the Geo 7's certified cases; the interface's balance does
      not use that solve yet. See `docs/certification.md`.

- [x] **Reference data collection** — `docs/collecting-reference-data.md` is a
      self-contained brief for building the database in a separate
      conversation, and `data/reference/CATALOGUE.md` is a generated inventory
      of what is already there. The documented format is read by
      `parseSimpleLineSheet`; testing the instructions found they described a
      format no reader accepted.

- [x] **Documentation split and health-checked** — `line-plans.md` (458
      lines) and `validation.md` (721) each covered two subjects; split into
      `line-sheets.md` and `departures.md`. The audit now checks document
      length, duplicate subsection headings and consistent section numbering,
      which caught `validation.md` after I had only looked at the other one.

- [x] **Self-audit** (`tools/audit.mjs`) — bundle coverage, unused exports,
      documented numbers, figure references and the test count. It found four
      real problems on its first run: thirteen exports with no caller, a
      reference corpus of which 63 of 72 files were never touched, a PMA
      strength table routed as a line sheet, and a stale test count.
- [x] **Checkout completeness** — `MANIFEST.txt` lists every file a working
      tree needs, the audit verifies it in both directions, and `build.py`
      reports all missing modules at once. Added after a repository was found
      holding 11 of 24 core modules with no build script, tests or data: the
      built HTML is self-contained, so nothing about using it revealed that it
      could no longer be rebuilt.
- [x] **One command runs everything** (`node tools/check.mjs`) — suite,
      Phase 1 audit, full pipeline, benchmark and self-audit, with the
      pipeline's 3 known problems pinned as a baseline so the number cannot
      drift up unnoticed. Four commands meant three got skipped, and this item
      staying open for most of the project was the evidence.

### Round of 2026-10-07 to 10-12: lines, fibres, inspection, and the real-data checks

- [x] **Line fibres from the suppliers' own sheets** — most of the catalogue
      was filed under the wrong fibre (the Edelrid 8000-U lines are aramid;
      PPSL, PPSLS, DSL, DFL and DC are Dyneema), `data/reference/line-materials-suppliers.tsv`
      holds the sources, and kinked retention now sorts by fibre almost
      without overlap. Sheathed line weights came down 20 to 50% to Edelrid's
      published figures; of two lines one diameter, the stronger is chosen.
- [x] **Loads by path** — a merged cascade carried only its first row's load
      (the risers held 55% of the pilot under A+B and C+D), and with uneven
      anchor counts per row 13 top lines carried nothing. Tension is summed
      down each anchor's own path, keyed by its own line.
- [x] **The cascade as real wings build it** — the rear row hangs from the
      row ahead's mains (it had mains of its own, 12 m a side); each junction
      limits its fan to 50 degrees from the line below, where a rule measured
      from vertical had added 11 to 14% of line; the stabilo junction sits
      four fifths of the way up rather than in the sail.
- [x] **Totals by path** — C and D totals ran on into the brake's lower line
      (0.62 m too long), and brake totals carried a riser they do not have.
- [x] **The PMA record and the inspection** — new strength where the
      standard asks for it, each line's coefficient by its fibre, totals by
      path at 5 daN; the inspection is a forecast at 50 h and the service
      hours, and its headroom takes the offset into account.
- [x] **The free body measures a line against its rib**, not against
      vertical.
- [x] **Riser webbing weighed as webbing**, 20 g/m, not as cloth.
- [x] **The pipeline builds each real wing as itself** — its own rows,
      risers and anchors where its sheets are on file, the published line
      height law, and a tip chord solved to the published area (it was 22% of
      the root, 1 to 7% short of the area).
- [x] **Front-row density measured on twenty designs** — 0.28 to 0.94 of
      the ribs, the range the anchor search keeps to (it was 0.50 to 0.95).
- [x] **Glide withheld where the models fail** — at 50 km the readout printed
      glide 8.48 beside "both models fail".
- [x] **Solve anchors to the line length** in the Lines panel, and **a
      remembered design compared with the one on the page** in the Balance
      panel: `anchorsForLineLength` and `compareDesigns` had no way in.
- [x] **The reference catalogue reads every supporting table** — 26 files
      were listed as "FAILED TO PARSE".
- [x] **Nesting four times faster**, with identical layouts.
- [x] **The derived plan attaches every second rib.** A real density on the
      default wing (13 of 25 ribs); a published wing from the picker now
      hangs from its own cascade, or from anchors solved to its line length
      as soon as it is built (round of 10-19, below).
- [x] **The picker sets each design's riser layout** — and its line counts,
      from its sheets where they are on file.
- [ ] **The brake lines dominate the inspection forecast**, on an estimated
      settle rate; no aged lineset has been measured.
- [ ] **A real arc is no circle** — the Geo 7's lines fit its published
      projected span worse on a circle (244 mm) than on a tighter one (110).
- [ ] **Single-skins are built as four rows** where the Skin 4 P and Bi Skin
      2 P have nine.
- [ ] **The interface's balance is the handbook's**, on typed coefficients;
      the coupled solve and the trim from the calage are core and suite only.
- [ ] **The speed system, trimmers and riser webbing** (`risers.js`) are core
      and suite only.
- [ ] **The Swoop2's 70 straps and 15 pieces between ribs** are read and
      listed, not built: the file does not say how high in the cell a strap
      sits.

### Round of 2026-10-19 to 10-21: the makers' own drawings of their line plans

- [x] **Six line-plan drawings transcribed** — Ozone's Vibe GT rigging
      diagram and UP's plans of the K2 5, Makalu 5, Torre, Summit X and
      Meru 2, line by line (`data/reference/lineplan-*.tsv`,
      `parseStatedTopology`). Inference from lengths alone gives Ozone's
      diagram on all 30 rows of six sizes; the drawn paths give UP's
      published totals with one riser to a main line, within 17 mm. See
      `docs/drawn-line-plans.md`.
- [x] **UP's .xls sheets filed one size late** — the converter paired each
      sheet with the next sheet's name; nineteen files renamed, contents
      unchanged. The inconsistent folding-line sheet is the Meru 2 M's, and
      its cutting lengths are the SM's.
- [x] **Stabilo lines read as A and B anchors** (the Summit X's a13 to b14,
      the Meru 2's a13 to c15), **the Makalu 5's mains read as a level above
      them**, and **riser counts assumed** — three two-liners sat in the
      three-riser group. The density table is keyed by layout now, and the
      tool has the four-row two-liner, `A+B/C+D`.
- [x] **A main in two parts is one main** — the Geo 7's C:5 is C:4, the
      Zeno 2's B:4 is B:3.
- [x] **A written cascade builds every count it gives** — its middles were
      read and dropped, and the example in the panel was not the wing it named.
- [x] **Each design's own cascade** (`DESIGN_LINES`, 19 designs, held to
      their sheets): the pipeline builds fifteen from it — the BGD Lynx 2, a
      three-liner, had been built as a two-liner — and so does the picker.
- [x] **Rows end where real ones do, and the stabilo is the rows' tip
      lines** — read off the plans that give rib positions, the rows' own
      lines stop at 0.78 to 0.89 of the half span and the stabilo's go on to
      the tip. Ozone, Niviuk and BGD name the stabilo's lines in their rows,
      and the totals show which (`tipLinesFromTotals`): eight designs carry
      "tip n" now, and a plan hangs them on one line (`stabilo`) — on the C
      riser on the Geo 7, whose "fourth C main" is that line. Stopping the
      rows short without that had left the outer sixth of every pipeline wing
      with no lines.
- [x] **The reference wings' arc is an ellipse through the projected span**
      — a circle projects 51 of the 55 short of their published projected
      area, 2.0% out on average against the ellipse's 1.0 — and **Niviuk's
      projected span is the one their projected aspect ratio and area give**,
      0.805 of the flat span on a Hook 6 where the area ratio gave 0.858.
      Over the 28 sizes with per-anchor totals the rows' shape deviation goes
      from 119 to 88 mm; a Hook 6 from the picker is 87 to 112 mm from its
      sheet on its 33 load-bearing anchors, its brake compared by itself.
- [ ] **The two-liners' bridles.** An Ozone two-liner's A row counts the
      lines under its bridle pairs as anchors; whether the bridles of
      neighbouring lines share ribs, no sheet or drawing on file says.
- [ ] **Middle lines the generator cannot shape are paired** — the Zeno 2's C
      top lines on its B middles, UP's level between middles and mains,
      Niviuk's shared C and D middles.
- [ ] **Built from their own counts, the two-liners and the Lynx 2 carry a
      third more line than their sheets**; the three-liners from the Hook 6
      to the Geo 7, 3% under to 12% over.
- [ ] **The brake's shape** is 91 to 197 mm from the real ones across the 28
      sizes with per-anchor totals, on either plan.
- [ ] **Tip lines the sheets cannot show** — UP's (a row of their own), and
      the designs with no per-anchor totals — take the default of two a row;
      where the stabilo's own line is not found, its riser is assumed (the
      one carrying B), and UP's plans leave it undrawn.

### Round of 2026-10-21: a second complete design

- [x] **The Tuluaq-19 read exactly** — Crazy Bird's 19 m² design from
      LEparagliding 3.25, with its own output and cutting file
      (`data/reference/lep/`). It crashed the tool on loading: an anchor at
      exactly 100% of chord missed in double precision, one at 0% put at the
      wing's origin 4.4 m away, and a webbing riser read as a line made of
      "daN". All three done as the program does them; then its 89 lines,
      ribs, rods, holes, attitude and main parameters held to the printed
      figures. It is in the picker beside the Swoop2. See `docs/tuluaq19.md`.
- [x] **Both designs' cut parts measured** from their 2D cutting files
      (`*-cut-parts.tsv`): every panel, rib, diagonal, strap, mini-rib and
      pocket at cut size, the reference the panel development lacked.
- [x] **The manifest listed none of the complete designs' files**, which
      the build embeds and the suite reads; it lists them now, the audit
      checks them, and the catalogue describes them.
- [x] **The rib carries its load on radials from the line to the seam** —
      straight rays from the tab to the upper seam, aimed by the line's own
      pull in the rib's plane (read off the plan: −23° to +22° on the default
      wing), shared by the cosine of each ray's angle as Flamant has it, cut
      by the holes, with what a lopsided fan pulls across the line held by
      the lower surface. It replaces a Whitmore band of 30° either side of
      straight up. On their own ribs, holes and lines, 86 of the two built
      designs' 88 loaded anchors pull inside a fan that reaches the seam 10 mm
      clear of every hole, 24 to 67° wide as it works; the two that do not
      are on tip ribs thinned to 1% and 10%. The openings now keep each
      line's own fan clear, the Rib tab draws the fans, and the report gives
      each line's pull, fan, reach and what the seam gets. See
      `docs/rib-stress.md`.
- [x] **An imported design's own panels** (`lepPanels`) — its surfaces
      parted where the intake opens under the nose, cut wider than their
      cells by its own skin tension (sections 31 and 5, read from the
      program's source), run over the intakes its section 26 closes, with
      its own seam allowances by edge. Every panel of both designs' cutting
      files measured: within 0.07% on the Swoop2, 0.12% on the Tuluaq, and
      0.03% in total, where the tool's own development was 4 to 8% off on
      each surface. The interface cuts, nests, prints and bills them, and
      cuts the ribs with the design's own allowance. See `docs/panels.md`.
- [x] **The Tuluaq's D row read as its stabilo** — every line to a row
      other than its riser's was taken for a stabilo line, and the load model
      gives the stabilo no lift: the tenth of the load the design's program
      puts on its D row, on the C riser, went nowhere. A row with no riser of
      its own is now that row.

### Round of 2026-10-22: what a design sews inside its cells

- [x] **An imported design's internal structure as cut** (`lepStructure`)
      — its full diagonals (one piece per rib and side over all its rows,
      a parabolic cut-out between each pair of anchors), straps, pieces
      between two ribs and rod pockets, built as its program builds them,
      read from the program's own source. Every one of the 196 pieces in
      the two cutting files is within a part in ten thousand of its file's.
      The bill carries them — 11.87 m² on the Swoop2 and 10.48 on the
      Tuluaq, where it had 3.9 and 5.5 — and the Diagonals DXF writes them.
      The two program versions draw two of them differently, and each file
      is held to its own. It found two things elsewhere: a lowered rib is
      lowered before its twist for its surfaces and after for its anchors,
      and a centre rib on the centreline is moved 0.01 out. See
      `docs/internal-structure.md`.
- [ ] **An imported design's trailing-edge mini-ribs** — 25 a side on the
      Swoop2, 16 on the Tuluaq, 0.84 and 0.89 m² for the wing in their
      files. The program cuts them from the section as it billows the cell
      over it (its 6.12.0 and its ovalization), which is not yet reproduced;
      the bill lists them as missing.
- [x] **The H-rib builder read a strap's width as a whole width in
      centimetres** — the Swoop2's type-11 straps are 2% of chord either side
      of the anchor, as the program reads them: four times the width it built
      at the root. It reads them the program's way now.
- [x] **A label of ours** — the Swoop2's seventy straps were listed in its
      cut-parts file as upper straps; they run along the lower surfaces at
      the anchors.

## Phase 3 — construction detail

- [x] **Rib stress and reinforcement reach** — at 1 g a 20 mm tab carries
      a real anchor load into bare rib cloth; at the 8 g case it does not, by
      a factor of four, so the model sizes how far the reinforcement must
      reach. `checkWingRibStress` runs it on a wing's own loads, each rib's
      own outline and each line's own pull, through the holes really cut: 80
      mm at most on the 12-cell test wing, 8 mm on the default wing, 13 mm on
      the Swoop2, 37 mm on the Tuluaq-19, and no rib needs tape to the seam.
      Three earlier accounts are corrected in `docs/rib-stress.md`: one
      rested on an invented 260 N anchor load, the next on a rib "a quarter
      of its chord" deep and a load path walked along the chord, the third
      on a fan standing straight up whatever the line did.

- [x] **Cell intake geometry** — the opening checked against the
      stagnation point, which goes as the square of the angle above the
      section's ideal angle of attack: 0.1% of chord under the nose at 2°,
      5.0% at 12° on a NACA 4415. The rib note says what the opening is fed
      at across the speed range. See `docs/intake.md`.
- [x] **Confusable sample counts guarded across the family** — `thinAirfoil`
      was passed an angle where it takes a sample count, a silent 9% error in
      the zero-lift angle. Five functions share the shape; a sweep found no
      other live misuse, and all five now refuse an angle-sized argument.

- [x] **A rib opening does two jobs** — lightening holes *are* the
      cross-ports, and modelling them as separate sets was the error the
      collision check exposed. On a normal rib the openings exceed the flow
      requirement six-fold, so weight sizes them, not flow.
- [x] **Openings unified** — a lightening hole is already a cross-port, so
      they are designed once against both constraints. The holes give 6.4x the
      flow requirement, so weight governs; `allRibOpenings` names any rib where
      it does not. The collision is gone by construction.
- [x] **A hole in a rib is a cross-port** — quantified: the openings give 6 to
      63 times the flow area a cross-port needs, so they are sized by weight
      on every rib of the test wing. `ribOpenings` already designed one set
      against both constraints; what was missing was the measurement.
- [x] **Collision checking between rib internals** — `checkRibInternals`
      compares holes, ports, diagonals and tabs as chordwise intervals,
      separating collisions from tight clearances. Note: the 270 mm overlap
      first reported for this was between two low-level functions the tool
      never combines; `ribOpenings` already treated a rib as having one set of
      openings. The check remains useful for diagonals and tabs.

- [x] **Design length is not manufacturing length** — four distinct lengths
      (flying, reference at 5 daN, sewn, cut), with the conversions between
      them. The measuring tension exceeds the 1 g load on every line, so a
      reference length is *longer* than a flying length by up to 20 mm — 166%
      of the inspection band. See `docs/lengths.md`.

Turning geometry into something a person can actually sew.

- [x] **Rib internals** — lightening holes placed into the space left after
      surface margins, nose band, anchor load paths and webs are subtracted,
      with the rules verified independently. See `docs/construction.md`.
- [x] **Cross-ports** — sized by the flow a cell needs rather than by what is
      spare, with an unmeetable requirement reported instead of met by an
      undersized port. See `docs/construction.md`.
- [x] **Bill of materials** — fabric by roll rather than by area, line by
      cut length rather than finished, hardware counted from the plan, and
      what is missing reported rather than treated as zero.
- [x] **Reinforcement layout** — mylar, dacron and tapes placed and totalled,
      anchor patches counted from the line plan, and a mass budget that
      reports the remaining gap against a published weight rather than
      claiming to be one. See `docs/construction.md`.
- [x] **Rods** — length along the rib surface rather than a chord
      fraction, mass as the square of diameter. Counting them removes them
      from the missing list. (Rebuilt since: `docs/rods.md`.)
- [x] **Thread and seam allowance** — both counted, taking a reconciliation
      against Skywalk's published SAGE 95 from 66% to 85% accounted. Cloth
      weight was the largest error: the default 38 g/m² against the wing's
      actual 27 g/m² is 509 g on the biggest item in the bill.
- [ ] **The last 15%** — 586 g on a 3.80 kg wing: reinforcement beyond the
      simple layout, riser hardware, labels, and cloth heavier after coating
      than its nominal grade.
- [x] **Brakes in the line plan** — the brake cascade now goes into the same
      plan, and a three-liner matches a real line table to within 1%: Geo 7
      111 against 112, Swift 6 115 against 114, riser counts exact.
- [x] **Main lines are a fixed count** — `mainsPerRow`, because a real wing
      carries the same mains in every size (Geo 7: A:3 B:3 C:5 in XS, MS and
      L alike). Mains now land exactly on the three-liners.
- [x] **Per-row attachment density** — `anchorsPerRow`. The fewer risers a
      wing has, the more its front row carries the shape: a three-liner is
      near-uniform, a two-liner runs A:30 B:14 C:8. Worst error across four
      real line tables falls from 37% to 6%, with the Zeno 2 exact.
- [x] **Per-row densities suggested from the reference designs** —
      `suggestAnchorsPerRow`, with three distribution shapes because the
      designs show three (taper, flat, step). Within 16% of every design.
      Recorded as six designs rather than 33 sizes: topology is constant
      within a family, so sizes are not independent observations.
- [x] **More designs.** The ratio table is 19 designs from four makers now,
      measured from their sheets by `tools/corpus-learnings.mjs`, and the
      front-row density 20 from five (`FRONT_DENSITY`: 0.28 to 0.94 of the
      ribs, median 0.54, with the cell counts in
      `data/reference/published-cells.tsv`). It still separates two-liners
      from three-liners without fitting a curve: the ranges nearly touch, at
      2.50 against 2.58. The density goes with the maker more than anything
      measured — Ozone's 0.50 to 0.94, UP's 0.28 to 0.62 — and the anchor
      search was kept to 0.50 to 0.95 by six Ozone wings, three of them with
      the wrong rib count.
- [x] **Stabilo lines** — found by name where a maker gives one and
      structurally where none does, which is two makers in three. Generated
      onto its own main line, and excluded from the lift distribution.
- [x] **Marking and registration** — notches paired at equal fractions of each
      seam so ovalization's 31 mm of ease becomes 3.9 mm per segment, plus
      grain arrows and panel labels on their own DXF layers. See
      `docs/construction.md`.
- [x] **Materials** *(ch.10)*: the line catalogue (78 lines, new and kinked
      strength, fibre, sheath and weight, from PHI's measurements and the
      suppliers' sheets), named cloth grades by location, rods and tabs.
- [x] **Line specification** *(ch.8.3–8.4)*: load per line from the cascade,
      diameter selection with a margin on each row, and the stretch and loop
      chain to cut lengths (`loads.js`).
- [x] **Bill of materials** with fabric metres, line metres by type, and
      hardware counted from the plan.
- [ ] **Fabric by colour** in the bill — the cloth is by grade and location;
      a colour scheme is not modelled.

---

## Phase 4 — workflow

Making it pleasant to use across a real project.

- [x] **Diagnosed the nesting loss** — 48.2% utilisation splits into 73%
      shape and 66% packing. Pairwise interlocking, which this roadmap
      assumed would fix it, does **not**: a developed panel is a near-straight
      strip of constant width, and interlocking a pair saves 1.8%. See
      `docs/nesting.md`.
- [x] **Packing against the outlines** — a skyline over real panel profiles
      rather than bounding boxes. 48.2% to 55.7%, 4.7 m of roll saved on a
      25 m² wing, zero overlaps, and it holds across roll widths.
- [x] **Packing from both edges of the roll** — a second skyline descending
      from the far edge, reaching the band a bottom-up packer cannot use.
      55.7% to 56.9%, and 61.0% on a 1.8 m roll.
- [ ] **Close the remaining placement gap.** On the default wing 63.5% of
      the roll is used, the panels filling 93.8% of their own boxes and the
      boxes 67.7% of the roll: the loss is the packing's. What is left needs
      true polygon placement rather than two skylines. (This said 56.9%
      against a 73% shape ceiling, figures from before the panels were
      aligned to their long axes: `docs/nesting.md`.)
- [x] **Place the tip panels into the gaps.** `pairPanels` now tries both a
      complementary order (largest with smallest) and the original adjacent
      one, and takes whichever packs better — neither wins on every wing. See
      `docs/nesting.md`.
- [ ] **Shape loss in the small panels.** Concentrated in a
      few small panels — cell 24 upper is 29% efficient against the root's
      96% — so they are the ones to fit around the large ones. A placement
      problem, not a pairing one.
- [x] **Design comparison** — two designs side by side, with the direction of
      each metric declared, trades named as trades, and no overall score.
      Immediately showed that a third more cells costs 2.5% of glide through
      20% more line drag. See `docs/comparing.md`.
- [x] **A search tool for what already exists** (`tools/find.mjs`) — searches
      names *and* doc comments, including private helpers, because all five
      functions written twice in this project were named differently the
      second time. All five would now be found before writing.
- [ ] **Undo/redo and named revisions.**
- [x] **Reference wings as loadable starting points** — twenty published
      sizes from seven families, in the interface. Loads the size only, and
      names every field that was not in the specification, so a loaded wing
      is not mistaken for the wing it came from.
- [ ] **Reference *shapes*** — a specification gives area, span and cell
      count but not ellipticity, sweep, arc or section. Recovering those needs
      a geometry file, which the LEP import can already read.
- [ ] **Prototype tuning** *(ch.4.7)*: record measured flight behaviour against
      predicted, and solve for the trim correction.
- [x] **Printed pattern output** — tiled to A4/A3 at exactly 1:1, with a
      100 mm calibration bar on every page, overlapping rather than butting,
      and blank tiles skipped: 518 pages instead of 1110.

---

## Phase 5 — analysis

Genuinely hard, and worth being honest about: this is where a design tool stops
describing geometry and starts predicting behaviour.

- [x] **Structural check**: line loads into rib and panel stress.
      `ribstress.js` does both — `checkWingRibStress` for the rib half, built
      earlier and left marked open, and `panelStress` /
      `checkWingPanelStress` for the sail. The seam is the nearer limit on
      every panel, and not a near one: 14% at 8 g on the test wing's widest
      cell, at the wing's own dynamic pressure. See `docs/rib-stress.md`.
- [x] **Spanwise lift distribution** by lifting-line — done in Phase 2;
      `spanLoadDistribution` in loads.js has used `liftingLine` since the load
      model was built. Listed here as open long after it shipped, which is
      what the roadmap staleness probe in `tools/audit.mjs` now catches.
- [x] **Inflated-shape estimate** — `inflated.js`. Billowing adds 4% wetted
      area, 0.8% of chord in thickness, and moves camber only because the two
      surfaces bulge unequally. It does NOT explain the missing 10% in minimum
      sink: the area effect is half a percent and roughness trades sink
      against glide. See `docs/inflated.md`.

Phase 5 items should be treated as research, not as features. Anything here
that produces a number a person might trust needs validation against measured
data before it ships.

---

## Working notes

**Test first, at the level the algorithm guarantees.** Several Phase 1 bugs —
a sign error in the trailing-edge derivation, panels nested wider than the
fabric roll, precision loss in the unrolling — surfaced because a test asserted
an exact value rather than a plausible one. Where a method is approximate, pin
the size of the approximation.

**Record departures from the source in `docs/validation.md`** as they are
found, with the reasoning. Several already exist; more will.

**Keep the core free of the DOM.** It is what makes the test suite possible and
what would let this run headless in a batch, which Phase 4's comparison work
will want.
