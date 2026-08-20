# Loads, line materials and drag

Phase 2's keystone: turning lift into load, load into line tension, and
tension into a line thick enough to hold it. Several roadmap items depended on
this one.

Reference data: the **PHI ALLEGRO X-alps 21** line sheet and PHI's measured
line materials table (78 line types), plus the ALLEGRO light size table across
six sizes. Under `data/reference/`.

---

## 1. The chain

```
lifting-line spanwise lift
  -> load per rib          (lift over the span each rib owns)
  -> load per anchor       (split between rows by chordwise share)
  -> tension per line      (a line carries everything above it)
  -> line selection        (smallest line whose kinked strength clears it)
  -> stretch correction    (cut short so it flies to length)
  -> line drag             (diameter x length -> Cx, back into the balance)
```

Only step 3 is exact. Steps 1 and 2 are models, and step 4 depends on a
materials table. Those are stated at the top of the module rather than buried.

**Load case.** EN 926-1 load-tests a paraglider to 8g, so that is the design
case, with a further factor on each line — 1.5 on main lines, 2.0 on brakes,
which see shock loading.

---

## 2. The correction the PHI data forced: kinked strength

The measured table carries **two** breaking loads per line:

| | new | kinked | loss |
| --- | --- | --- | --- |
| Edelrid 8000-135 (U-135) | 160 daN | 85.6 daN | **47%** |
| Liros TSL 140 | 140 daN | 67.6 daN | **52%** |
| Liros PPSLS 260 | 280 daN | 259.4 daN | 7% |

A line in service is not straight. It is knotted or spliced at every loop,
bent round every maillon and pulley, and creased in the bag. Sizing on the new
figure under-sizes by nearly a factor of two on exactly the lines a designer is
most tempted to make thin.

**Selection therefore uses the kinked strength by default.** `strengthBasis:
'new'` exists for comparison and should not be used to build anything.

### A consequence worth knowing

Ranked by kinked strength per millimetre of diameter — the figure of merit,
since drag goes with diameter:

| line | diameter | kinked | daN per mm |
| --- | --- | --- | --- |
| PPSLS 260 (sheathed) | 1.58 mm | 259.4 | **164** |
| PPSLS 180 (sheathed) | 1.25 mm | 194.4 | **156** |
| DC40 | 0.50 mm | 41.0 | 82 |
| U-135 (unsheathed) | 1.10 mm | 85.6 | 78 |
| U-050 (unsheathed) | 0.61 mm | 23.5 | 39 |

Sheathed Liros lines *beat* unsheathed Dyneema per millimetre once kinked,
because they barely lose strength when bent. On the new-strength figure the
ranking reverses. This is exactly what the reference wing does: PPSLS for the
long lower gallery where lines are thick anyway, thin DC and U lines for the
uppers where loads are small.

---

## 3. Line drag, and closing a Phase 1 loop

`cxLines` has been a typed-in constant since Phase 1, defaulting to the
handbook's 0.020. It need not be. A line is a bluff cylinder: drag area is
diameter times length times a coefficient near 1.1, adjusted for inclination
to the flow by `sin^2(psi)` — the independence principle for yawed cylinders —
and divided by wing area.

Computed for a modern thin lineset it comes out near **0.006-0.010**, roughly
a third of the handbook's figure, which came from a 2012 school wing with more
and thicker line. Since line drag is a large share of a paraglider's total,
the difference is not academic:

| | glide ratio | line share of drag |
| --- | --- | --- |
| assumed 0.020 | 9.37 | 28.7% |
| computed 0.0097 | **11.00** | 16.3% |

That is most of why modern wings glide better than the handbook's example.
`equilibriumInputsFrom` hands the computed drag and the lineset's own mass
straight back to `solveEquilibrium`.

---

## 4. Two bugs the closure check caught

The load model asserts that anchor loads sum to **half** the wing's load,
because a plan describes one side. Two failures showed up immediately, and
neither would have been visible in the output:

**Ribs double-counted.** Assigning each anchor the load of a fixed window of
ribs around it counts twice every rib that two anchors share, inflating the
total by 50%. Fixed by assigning each rib to its single nearest attachment
point, which partitions the span exactly once.

**A whole row's load vanished.** Riser tension was summed over lines at
`riser` level. But a cascaded row — D on a three-riser wing — reaches the
maillon while still numbered as middle lines, so the D row's load never
reached a riser. Fixed by summing what meets each maillon, not what is
labelled.

Closure is now exact to 0.01%.

---

## 5. The PHI line sheet: a third format

Where the Ozone sheets are an inventory with a totals matrix alongside, this
is a **cascade table** — one row per canopy attachment, with each level's
length across the columns and the total in a "Checking" column.

```
Rib | upper | middle | riser | ... | Checking
  2 |  1344 |   1779 |  4255 |     |     7378
  5 |  1247 |        |       |     |     7281
```

A blank means "shared with the row above", and the **name** columns say which
line that is — `a1|A1|AI` then `a2|A1|AI`. A third naming convention again:
lowercase for upper lines, uppercase for middle, roman numerals for riser.

Reading the columns positionally, carrying the last value forward, cannot tell
a shared line from a level that simply does not exist for that anchor, and gets
both wrong at the tip. Keying on names gets it right.

**The arithmetic closes exactly** — level lengths sum to the printed total with
no residue, unlike the Ozone sheets where riser length had to be inferred. All
42 main-row anchors close to the millimetre, which makes this the strongest
check on cascade totals anywhere in the project.

### Cross-row cascades, confirmed from a second manufacturer

The checker resolves deficits against other blocks, and recovers the same
structure the Ozone wings showed:

- **D inherits `C1 + CI` from the C row** — four anchor rows on three risers,
  D cascading into C.
- **B and C tip lines inherit `AIII` from the A row** — at the tip the rows
  merge onto a shared riser line.

Three manufacturers, three formats, same underlying arrangement.

---

## 6. Not decoded

The **brake block** is parsed structurally but flagged rather than guessed at.
Brakes run a deeper cascade and list each upper line twice — once plain and
once with the spanwise distribution added, offset by exactly the `A-dist`
column — so the level columns do not line up one-to-one with the names.
Decoding it properly needs the brake and pulley geometry, which is the next
roadmap item.
