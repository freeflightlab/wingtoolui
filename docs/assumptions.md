# Assumptions, and who gets to make them

An audit of every numeric default in a core module's options found **75**, of
which **33 could not be reached from the interface**. Some are internal tuning
— a packer's search resolution, an integration step count — and stay where
they are. The rest are design decisions, and a tool that hides a design
decision makes it on the user's behalf without saying so.

## 1. What is now adjustable

| setting | was | why it is a decision |
| --- | --- | --- |
| karabiner separation | 0.42 m | sets where the cascade converges; changes the whole line plan |
| loop allowance | 130 mm | material, not rounding: 130 mm over 88 lines is 11 m of cord |
| line drag coefficient | 1.1 | a cylinder in cross-flow, but Reynolds number moves it |
| measuring tension | 5 daN | the PMA's, and it sets the reference length an inspector checks |
| row load shares | convention | the handbook table, or the section's own pressure distribution |
| print margin and overlap | 10 / 15 mm | depends on the printer, not on the wing |

Each is asserted to change the model, and separately asserted to change an
exported file. **A control that changes nothing is worse than no control:** it
tells the user they have a choice when they do not.

## 2. Three things the audit found on the way

### `M.loads` was read in three places and assigned in none

The rib-stress report and the load column in the Lines table both read it. It
was never computed, so **both features silently showed nothing** for as long
as they existed. A field that is only ever read is a feature that was never
wired.

The pipeline now computes loads, line selection and the length chain.

### Two line models, and the export used the wrong one

`linesCSV` exported `M.cascade` — chapter 8's weighted-centroid cascade —
while the Lines view, the loads, the bill of materials and the PMA sheet all
use `M.linePlan`. Changing the karabiner separation moved the plan and left
the exported lengths untouched.

The export now comes from the plan the rest of the tool uses, carrying the
flying, sewn and cut length of every line with its load and material.
`buildCascade` still draws the front view, which is what it is for.

### The settings probe could only see length changes

It compared exported files by **byte length**. A setting that changed `378` to
`382` in every row produced an identical length and was reported as inert. It
compares content now, and was verified to fail on a deliberately inert
setting.

## 3. The controls were in one heap

Exposing the assumptions made a second problem obvious: **30 of 74 controls
sat in a single group** called "Panels & cutting" — the line plan, the
assumptions, the rib openings, the diagonals and the printing, all together.

They are now nine groups that match what a designer is working on:

| group | controls |
| --- | --- |
| Planform | 9 |
| Airfoil | 9 |
| Arc & twist | 11 |
| Environment | 2 |
| Balance | 13 |
| **Lines & risers** | 5 |
| **Internal structure** | 8 |
| Panels & cutting | 10 |
| **Assumptions** | 7 |

Splitting them **duplicated three settings** — `mergeRows`, `compareTo` and
`lineRow` each ended up with two controls, because the same setting was bound
in two groups at once and nothing checked. One of the duplicates carried the
wrong option values: `mergeRows` was offered as `ab`/`cd`/`abcd` where the
model expects `AB`/`CD`/`AB+CD`, so choosing a merge would have silently done
nothing.

The interface test now asserts every setting has **exactly one** control and
that none is unreachable — verified by adding a duplicate and watching it
fail.

## 4. And two in the checks themselves

The unused-export check read `tests/run-tests.js` alone, so a function used
only by the Phase 1 audit, the full-pipeline run or the reference sweep
counted as unused. It flagged `lineBudget`, which the Phase 1 audit exercises
by name. It reads every test file now.

The interface test read a LEP sample from `/tmp` that was never committed. It
passed for as long as that scratch file happened to exist and failed the
moment it did not. **A test depending on something outside the checkout does
not run for anyone else.** It now reads the Swoop2 from the repository — a
better fixture anyway, since its published figures are known: 18.00 m² and
8.46 m projected span, both reproduced.
