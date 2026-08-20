# Roadmap

The handbook has twelve chapters and two appendices. Phase 1 covers the ones
that form a closed loop from parameters to cutting files; the rest add depth,
accuracy and workflow.

Each phase is sized to be independently useful — the tool should be worth
opening at the end of every one, not only at the end.

---

## Phase 1 — geometry pipeline ✅ complete

Everything needed to go from numbers to a cutting file.

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
- [x] 594-test validation suite and a benchmark with regression budgets
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
- [ ] **Trimmers** *(ch.9.3)* and riser webbing geometry — B-handle heights,
      C-handle steering, and the split between main and speed-system webbing.
- [ ] **Line loads under acceleration** — loads shift forward on the bar,
      changing what each row carries; `loads.js` still assumes trim.
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
- [ ] **Gust alleviation** — the gust model is sharp-edged, with no
      alleviation factor. Conservative, but a real wing's fabric and line
      stretch shed some of it.
- [ ] **Asymmetric and collapse load cases** — everything so far is symmetric
      steady flight. A one-side collapse loads half the lineset at a much
      higher factor, and is what actually breaks lines.
- [ ] **Brake cascade decoding** — the PHI sheet's brake block lists each upper
      line twice, plain and with the spanwise distribution added, so its
      columns do not map one-to-one onto names. Needs the pulley geometry.
- [ ] **Line drag by inclination from real geometry** — currently each line's
      angle to the flow is taken from its own endpoints where available and a
      single factor otherwise. Wake interference between lines is not modelled
      at all and is known to matter.
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
- [ ] **Rib internals in the rib view** — lightening holes, cross-ports and
      attachment tabs are Phase 3 geometry and would show here first.
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
- [ ] **Confirm the two-liner effect independently** — riser count is still
      partly collinear with aspect ratio in this sample, since both two-liners
      are high-aspect wings. A low-aspect two-liner or a high-aspect
      three-liner would settle it.
- [ ] **Line count as a scaling parameter** — the total-line-length slope
      tracks how many lines a wing carries (258 pieces on the Ultralite 5
      against 224 on the Geo 7). Normalising by piece count may recover a
      transferable law; on the Geo 7 the mean length per piece divided by span
      is constant to 0.0025, but on the Ultralite 5 it drifts by 0.011 across
      a near-doubling of area.
- [ ] **Scale a full design, not just its summary numbers** — `scaleToArea`
      returns a size's parameters; driving the whole pipeline through it to
      emit cutting files for every size in a family is the next step.
- [ ] **Per-size line sizing** — loads scale with k^2 while line strength
      scales with area, so a family's linesets are not similar. Each size
      needs sizing from its own loads.
- [ ] **Discrete hardware** — riser length and speed-system travel step
      between sizes (570/600 mm, 150/180 mm) rather than scaling. Needs a
      table, not a law.
- [ ] **Left/right and asymmetric plans** — quantities of 2 and 4 already
      encode mirror pairs; asymmetric line or colour plans do not yet exist.
- [ ] **Riser hardware** — maillons, pulleys, speed-system travel and trimmer
      geometry, feeding the calage variation study (LEP section 28).
- [ ] **Reference wing library** — the 17 imported production line sets as
      selectable comparison targets, so a design can be diffed against a real
      wing of similar size while it is being drawn.
- [ ] **Read the remaining LEP sections into the model** — 9-11 (the line
      cascade matrix, richer than this project's centroid method), 12 (V-ribs),
      29 (3D shaping), 34 (line characteristics), 35 (equilibrium inputs).
      All are round-trip safe today; mapping them into the model is next.
- [ ] **Reference wings from the gnuLAB / gnuA / BHL series** — dozens of
      complete published designs with airfoils and areas, usable as both
      starting points and validation cases.


The parts the source describes but Phase 1 skipped, plus the accuracy work the
validation notes flagged.

- [ ] **Diagonal ribs** *(ch.7)*. The source is figures only, so this needs
      reconstruction from the drawings: V-ribs and horizontal straps, their
      attachment geometry, and their effect on the rib cut.
- [ ] **Risers and speed system** *(ch.9)*. Four-riser geometry, travel of each
      riser under acceleration, and the resulting change in calage — which
      makes the balance solve a curve over the speed range rather than a point.
- [ ] **Trimmers and the accelerated polar.** Re-solve equilibrium across the
      speed system's travel and plot speed against sink.
- [ ] **NACA 5-digit and modified 4-digit sections**, matching the generator
      this project was cross-checked against.
- [ ] **Feed the polar back into the balance solve.** The polar now computes
      CL, CD, Cm and the Oswald factor properly, but chapter 4's equilibrium
      still takes them as typed-in numbers. Wiring the two together closes the
      loop between section, planform and trim.
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

## Phase 3 — construction detail

Turning geometry into something a person can actually sew.

- [ ] **Rib internals** *(ch.2.7)*: lightening holes with structural margins,
      cross-port placement, attachment tab geometry.
- [ ] **Reinforcement layout**: Mylar at the intakes, Dacron at anchor points,
      seam tapes.
- [ ] **Marking and registration**: alignment notches, cell numbers, grain
      direction on every panel.
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

- [ ] **Better nesting.** Currently about 42% utilisation. A proper no-fit
      polygon packer with pairwise interlocking and colour blocking should
      reach 60–70%. This is the single largest material saving available.
- [ ] **Design comparison**: hold two designs side by side, diff their numbers.
- [ ] **Undo/redo and named revisions.**
- [ ] **Reference wings**: the parameter sets from the handbook's own gnuLAB
      series as loadable starting points.
- [ ] **Prototype tuning** *(ch.4.7)*: record measured flight behaviour against
      predicted, and solve for the trim correction.
- [ ] **Printed pattern output**: tiled A4/A3 pages with registration marks for
      anyone without a plotter.

---

## Phase 5 — analysis

Genuinely hard, and worth being honest about: this is where a design tool stops
describing geometry and starts predicting behaviour.

- [ ] **Structural check**: line loads into rib and panel stress, so the
      reinforcement layout has a basis rather than a convention.
- [ ] **Spanwise lift distribution** by lifting-line, replacing the uniform
      assumption in the line cascade's load case 1.
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
