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
- [x] 303-test validation suite and a benchmark with regression budgets
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
- [ ] **Brake cascade generation** — `K`/`KM`/`KMU`/`KRU`/`KRL` lines are
      parsed and named but not generated. Needs the uneven spanwise
      distribution and the pulley geometry.
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
- [ ] **Chordwise pressure distribution** to replace the fixed A/B/C/D load
      shares (35/35/20/10). The row shares are the handbook's convention; a
      real pressure distribution over the section would place them properly
      and would change with angle of attack.
- [ ] **Brake cascade decoding** — the PHI sheet's brake block lists each upper
      line twice, plain and with the spanwise distribution added, so its
      columns do not map one-to-one onto names. Needs the pulley geometry.
- [ ] **Line drag by inclination from real geometry** — currently each line's
      angle to the flow is taken from its own endpoints where available and a
      single factor otherwise. Wake interference between lines is not modelled
      at all and is known to matter.
- [x] **Size-family scaling** — canopy scales isometrically (aspect ratio held
      to 6.03 across six sizes); line length and mass follow affine laws with
      a fixed component. Valid for interpolation only: extrapolated beyond the
      fitted range the affine law is worse than isometric, so the module falls
      back. See `docs/scaling.md`.
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
