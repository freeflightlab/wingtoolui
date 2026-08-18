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
- [x] Export: DXF R12, SVG, CSV, project save/load
- [x] Nesting with orientation search and skyline packing
- [x] Four live viewports
- [x] 101-test validation suite

---

## Phase 2 — accuracy and the missing chapters

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
- [ ] **Airfoil aerodynamics.** Right now Cz, Cx and Cm are typed in by hand.
      A thin-airfoil or panel-method estimate would let the section drive the
      balance directly, and make the polar sweep meaningful.
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
