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
- [x] 1508-test validation suite and a benchmark with regression budgets
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

- [ ] **3D shaping of the leading edge** — a four-part study on forming the
      nose in ripstop, including negative shaping. Changes panel geometry near
      the LE and is standard on modern wings.
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
- [ ] **B-handle and C-handle geometry** — handle heights and the steering
      travel they give, which the riser assembly does not yet carry.
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
      lift than its span fraction (25% of span sheds 17% of lift), a frontal
      collapse moves the A row's load onto C, and sized on the full envelope
      the asymmetric case governs every line with 35 of 76 needing more
      material than symmetric sizing.
- [x] **Reconciliation with real linesets** — checked against PHI's own line
      choices: the collapse envelope implies 28.6x the 1g load, and PHI's most
      load-critical line sits at 28x. Real wings are already built to the
      collapse case, which is why they survive one; symmetric certification
      sizing alone is thinner than any line on that wing.
- [x] **Practical minimum diameter** — neither PHI nor Ozone uses line below
      0.50 mm, and it is handling rather than strength that stops them. With
      the floor in place most of a lineset is floor-sized, not load-sized, and
      `selectLines` reports which.
- [ ] **Measured collapse loads** — the dynamic factor is still a stand-in.
      The agreement above is circumstantial: a different factor with a
      different collapse fraction lands in the same place.
- [ ] **Brake cascade decoding** — the PHI sheet's brake block lists each upper
      line twice, plain and with the spanwise distribution added, so its
      columns do not map one-to-one onto names. Needs the pulley geometry.
- [x] **Wake interference between lines** — measured rather than assumed.
      Only 16 of 88 lines are genuinely inside another's wake once the wake
      width is taken properly, against 67 by a naive proximity test. Worth
      2.7% of line drag and +0.03 of glide. Off by default.
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
      manufacturer. Used as a genuine out-of-sample test, which found that the
      aspect-ratio line-length law assumes span scaling and is up to 16% out
      on an area-scaling family.
- [ ] **Why BGD scales its lineset with area** — five families scale total
      line length with span (exponent 1.02-1.30), BGD with area (2.03). BGD is
      the only 2.5-liner in the set; whether the hybrid layout is the cause is
      untested. More makers would settle it.
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
- [ ] **Magnum 4, Vibe GT and Enzo 3 line sheets** — converted but not yet
      folded into the validation set. The Magnum 4 is the first five-riser
      wing here and the first tandem.
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
- [ ] **Why BGD is the outlier on two counts** — the largest residual
      (+10.2%) and the only family scaling its lineset with area rather than
      span. Two anomalies, one manufacturer, no explanation.
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
- [ ] **Diagonals as structure** — treated as load paths and cut patterns,
      not members with stiffness. Whether a diagonal is in tension across its
      whole width is not modelled.
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
- [ ] **Riser-aware line plans.** The cascade generator still assumes one
      riser per anchor row; real wings put four rows on three risers. The
      importer already models this correctly — the generator needs to follow.
- [ ] **Per-rib balance.** The current solve treats the central section as
      representative, as the handbook does. Solving spanwise would let washin
      and taper feed back into trim.
- [ ] **Ovalization from pressure**, rather than a flat 6%. The degree of
      billow depends on spanwise tension, which depends on the arc — the
      source says so but does not close the loop.

---

## Audit

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
- [ ] **Split multi-size sheets** — three UP sheets list one column per size,
      so a single line name carries several lengths. Recognised and skipped
      rather than misread.

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

- [x] **Full-pipeline validation** (`tests/full-pipeline.mjs`) — all 38
      published sizes through every stage, checked against each other and
      against physics. Found four defects every module test passed: a
      square-rooted area ratio used as a span ratio (19.5% out on every wing),
      anchor density driven by cell count (inverting the aspect-ratio/drag
      relationship), anchor loads grouped by index rather than rib (12% of the
      wing's weight lost), and an unknown layout name silently defaulted.
      See `docs/full-pipeline.md`.
- [x] **Cascade junction and line length measured, not assumed** — the second
      junction was at 0.78 against a measured 0.860, and the line length 30%
      long. Total consumption +38% to +16% against published.
- [x] **`recoverLevelFractions`** — reads the cascade junction back from any
      real line table. It is a design parameter spanning 0.786 to 0.925, not
      a constant.
- [ ] **The last +16%: two-liner middle lines run too far sideways.** Three
      explanations ruled out by measurement — not a missing fourth level (all
      five wings run three), not riser count (within-group spread exceeds
      between-group), and not the junction fraction (an 18% change moves the
      middle length 2%). The generator's middles are 1812 mm against the
      Zeno 2's 886 while the Geo 7 matches; the branching ratio is right at
      3.0 against 3.14. It is the lateral run that is wrong.
- [ ] **Low-Reynolds profile drag** — minimum sink comes out at 0.69 m/s on
      the two smallest wings, below anything real. The estimated polar is
      optimistic at low Reynolds number.

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

## Phase 3 — construction detail

- [x] **Rib stress and reinforcement reach** — rib cloth cannot carry an
      anchor load at all, even at 1 g, so the model sizes how far the
      reinforcement must reach. Wired to real anchor loads via
      `checkWingRibStress`: the longest reach on a real wing is 44 mm and no
      rib needs tape to the seam. An earlier claim of a spanwise rule came
      from an invented 260 N anchor load, 10x the real one, and is corrected
      in `docs/rib-stress.md`.

- [x] **Cell intake geometry** — the opening placed and checked against the
      stagnation point, which moves 3.3% of chord across the speed range. Two
      distinct failure modes reported separately. See `docs/intake.md`.
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
- [x] **Rods** — arc length along the rib surface rather than a chord
      fraction (8.3% longer), mass as the square of diameter, and shorter rods
      on the closed ribs. Counting them removes them from the missing list.
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
- [ ] **More designs.** Six is enough to separate two-liners from
      three-liners and not enough to fit a curve. The ratio ranges nearly
      touch at 2.13 against 2.58.
- [x] **Stabilo lines** — found by name where a maker gives one and
      structurally where none does, which is two makers in three. Generated
      onto its own main line, and excluded from the lift distribution.
- [x] **Marking and registration** — notches paired at equal fractions of each
      seam so ovalization's 31 mm of ease becomes 3.9 mm per segment, plus
      grain arrows and panel labels on their own DXF layers. See
      `docs/construction.md`.
- [ ] **Materials** *(ch.10)*: a real properties table — weights, strengths,
      stretch — feeding wing mass estimation and line sizing.
- [ ] **Line specification** *(ch.8.3–8.4)*: load per line from the cascade,
      then diameter selection and sheathing decisions with a safety factor.
      Requires the load model Phase 2 adds.
- [ ] **Bill of materials** with fabric metres by colour, line metres by type,
      and hardware counts.

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
- [ ] **Close the remaining placement gap.** 56.9% against a 73% shape
      ceiling. What is left needs true polygon placement rather than two
      skylines.
- [ ] **Place the tip panels into the gaps.** Shape loss is concentrated in a
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

- [ ] **Structural check**: line loads into rib and panel stress, so the
      reinforcement layout has a basis rather than a convention.
- [x] **Spanwise lift distribution** by lifting-line — done in Phase 2;
      `spanLoadDistribution` in loads.js has used `liftingLine` since the load
      model was built. Listed here as open long after it shipped, which is
      what the roadmap staleness probe in `tools/audit.mjs` now catches.
- [ ] **Inflated-shape estimate**: the built shape and the flying shape differ,
      and every measurement in the handbook is of the flying one.

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
