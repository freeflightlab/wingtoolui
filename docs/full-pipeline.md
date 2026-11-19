# Running every real wing through the whole tool

The test suite checks modules. The Phase 1 audit checks roadmap claims.
Neither asks the question that matters most:

> Given a real wing, does the **complete pipeline** produce a coherent,
> physically sensible design?

`node tests/full-pipeline.mjs` runs all 55 published sizes in the reference
database — the 38 of `size-families.tsv` and Niviuk's 17 in `niviuk-spec.tsv`
— through every stage: planform, arc, 3D assembly, development, nesting, line
plan, loads, line selection, length chain, inspection, rib internals, and
flight. It checks the results against each other and against physics.

**It found four defects that every module test passed.** Each module was right
on its own; they were wrong in company.

---

## 1. The projected span ratio was a square-rooted area ratio

`buildLobe` takes a **span** ratio. `referenceDesignInputs` was giving it
`sqrt(projectedArea / flatArea)`.

Those are unrelated quantities. An arc shortens the span; it also loses the
cosine of the local dihedral from the projected area, and no square root
connects the two. On the PHI Allegro light the published span ratio is 0.794
and the rooted area ratio is 0.926.

**Wrong on every wing in the database, by up to 19.5%.** Now 0.00% on every
size that publishes a projected span, and Niviuk's is the one their projected
aspect ratio and area give. The arc through it was a circle, which projects
51 of the 55 wings short of their published projected area; it is the
handbook's ellipse now, 1.0% out on average against the circle's 2.0, −2.0 to
+2.1% on every size, and the run flags a wing more than 3% out
(`docs/reference-wings.md`).

## 2. Anchor density was driven by cell count, inverting the real relationship

Across the seven published families, line consumption per metre of span
correlates with aspect ratio at **r = −0.966** (the first size of each family
that publishes a total). A high-aspect wing has *more* cells and *less* line:
the Zeno 2 has 78 cells and 16.1 m per metre of span, the Ultralite 5 has 34
cells and 26.7. (This said −0.977, which is what the same calculation gives
with the Lynx 2 at BGD's published 209 m; the reference table now holds the
sum of BGD's own line sheets.)

`everyNthRib` drives anchors off the cell count, so the generator had it
exactly backwards. The pipeline caught it as a contradiction nothing else
could see:

```
FAIL  higher aspect ratio has less line drag  (0.00914 vs 0.01242)
```

Higher aspect ratio was coming out with **more** line drag — the opposite of
why high-aspect wings exist. The pipeline now builds each wing one of two
ways: a design whose line sheets are on file with its own cascade
(`DESIGN_LINES`: riser layout, anchors, mains, and middles where the generator
can build them); any other with `anchorsForLineLength`, which solves the
anchor density to the published line total inside the densities real wings
use (0.28 to 0.90 of the ribs on the front row, measured on twenty designs).
The relationship holds: 0.00886 of line drag for the three lowest aspect
ratios against 0.00720 for the three highest.

**The interface was not part of that fix.** Its derived plan attaches every
second rib: on its own default wing a real wing's density — 13 anchors on 25
ribs, against a measured median of 0.45 — and nothing like one on a published
wing, where a Zeno 2 S came out with 425 m of line against its published 186.
A wing from the picker now hangs from its own cascade where its sheets are on
file, and from anchors solved to its published total where they are not
(`docs/drawn-line-plans.md`). **Solve anchors to the line length**, in the
Lines panel, runs the same solve on any wing and writes the plan it built out
as a cascade: on a Geo 7 MS 258 m against 263.5, on an Alpina 5 ML on two
risers 226 against 229.7. Under a three-riser layout a two-liner's total is
below anything a real density gives, and the solve says so and names the
layout as the cause rather than the ribs.

## 3. Anchor loads were grouped by anchor index, not by rib

Safe while every row had the same anchor count: anchor 3 of row A and anchor 3
of row C were the same rib. With per-row densities they are not — on a Zeno
2-sized wing with A:19 B:11 C:6, row A's third anchor is 12 to 15% of the
half span out and row C's third is 47 to 48%.

Grouped by index, the span load went to ribs that did not carry it. **7 to 12%
of the wing's weight lost on three sizes**, while others closed to 0.01% — the
inconsistency being what made it findable.

Worst closure across the sizes: **12.12% → 0.024%** (an Ultralite 5 15),
none over 0.05% on any of the 55.

## 4. An unknown layout name was silently absorbed

Three tests passed `RISER_LAYOUTS['A/B']`. That is not a key — the layouts are
`A/B/C+D`, `A/B+C`, `A/B/C/D`, `single`, `A-A'/B/C`, `A-A'/B` and `A/B/C`. A
destructuring default fires on `undefined`, so the default layout, `A/B/C+D`
(four rows on three risers), was substituted and **the plan under test was
not the plan described**. Nothing failed. An unknown name is refused now, and
the refusal lists the seven.

The check has to happen on the raw options object, before destructuring, since
neither a default nor a sentinel can tell an omission from an explicit
`undefined`. I got that wrong twice before getting it right.

---

## 5. What remains, stated rather than hidden

**Total line length, against the published total:**

| | wings | mean | range |
| --- | --- | --- | --- |
| all | 55 | +4% | −26 to +31% |
| own cascade, three risers | 23 | +3% | −8 to +31% |
| own cascade, two risers | 16 | +15% | +7 to +27% |
| density solved, three risers | 11 | −7% | −26 to +2% |
| density solved, two risers | 5 | 0% | 0 to +1% |

By family, from their own cascades: Hook 6 −6%, Ultralite 5 −8 to +1%, Geo 7
+3 to +5%, Alpina 5 +7 to +8%, Zeno 2 +11%, Lynx 2 +23 to +31%, Artik R 2 +26
to +27%. Until 1.11.0 every one of them carried the brake cascade with its
first junction at the pulley, a fifth to a half more brake than its sheets
(below), and the whole set ran +11% (−22 to +40%). The two Ozone two-liners
were +30% and +46% until their A rows were built as they are, fifteen and
fourteen ribs with eight bridle pairs, rather than a rib for every bridle.
Every line set here has its stabilo in it, as the published totals do: each
row's tip lines on one line, to the riser its sheets say — the Geo 7's
"fourth C main" is its stabilo's line, so its C row has three — or to the B
(`docs/drawn-line-plans.md`, section 5). The Lynx 2 and the Artik R 2 were
density-solved until 2026-10-21, the Lynx 2 on two risers it does not have;
built as themselves they carry a quarter more line than their sheets.

The density-solved wings went the other way. They are solved to the published
total at no sparser and no denser than a real wing: one of the 16, an
Allegro light size on the three risers its aspect ratio gives, is still over
at the sparsest (all six were, with the brakes as they were), and five under
at the densest — Niviuk's single-skins, the Skin 4 P and the Bi Skin 2 P,
built here as four rows where the real wings have nine, −14% and −26% now
that the brakes no longer make up for them.

What got it there, each measured:

- **The line height was a sixth too short.** The pipeline built every wing
  with 0.464 × span of line, "what real mains imply" — which is the length of
  one main, not of a path from sail to riser. 5.35 m on a Geo 7 MS whose lines
  are 6.42. It uses the published heights' own law now, 0.566 × span + 0.459 m
  to the karabiner, less the riser. Short lines had hidden about as much of the
  generator's surplus as they added.

- **The rear row had three lines a side to the riser that no wing has.** A D
  row on a C+D riser hangs from the C row's mains on every real three-liner;
  the generator gave it mains of its own, 12 m a side on the default wing.

- **A limit on line angle, measured from vertical, doubled the outboard top
  lines.** It pulled a junction down until no line above it was more than 60°
  from vertical, which on an outboard group is most of the way to the riser.
  The rule now limits the fan at each junction to 50° from the line below it,
  which is what real wings show (Geo 7 pairs open about 65° between the two
  lines, 32° each side). It was 11 to 14% more line on each of the four wings
  compared.

- **The second cascade junction was at 0.78 against a measured 0.860.** The
  sound measurement is the middle-to-main length ratio *within one wing*,
  since both are means over the same cascade — Geo 7 0.429, Alpina 5 0.446,
  Zeno 2 0.229, Swift 6 0.308, Lyght 0.304, mean 0.343, which puts the second
  junction at 0.64 × 1.343. An earlier attempt averaged each level separately
  and read the junctions off the totals. That is *not* a path down the cascade
  — the mean upper and the mean main belong to different branches — and it
  gave 0.888. Close by luck, wrong by method.

  It matters less than it looked. Across the five wings the recovered junction
  runs **0.786 to 0.925**, and moving the generator's from one end to the other,
  an 18% change, moves its middle lines by 5% (1626 to 1709 mm). A shape
  comparison against one wing that once preferred 0.78 no longer
  distinguishes them: 161.0 mm against 161.6.

### Level by level

Built as the pipeline builds it — its own cascade, at the line height the
published heights' law gives — against its own sheet, per side and without
the brakes (mean lengths):

| | total | bridles | uppers | middles | mains |
| --- | --- | --- | --- | --- | --- |
| Geo 7 MS | 115.3 / 110.0 m (+5%) | — | 484 / 482 mm | 1977 / 1663 | 4025 / 3874 |
| Ultralite 5 19 | 106.6 / 111.7 m (−5%) | — | 414 / 848 | 1621 / 827 | 3303 / 3270 |
| Alpina 5 ML | 99.0 / 89.1 m (+11%) | 202 / 192 mm | 566 / 716 | 1560 / 1122 | 4364 / 2867 |
| Zeno 2 ML | 89.6 / 81.6 m (+10%) | 184 / 178 | 568 / 800 | 1601 / 973 | 4621 / 3876 |

**Each of the three Ozone two-liners carries sixteen short bridles a side** —
`A1a` and `A1b` to `A8a` and `A8b`, 173 to 228 mm on the Alpina 5 ML — in
pairs that gather two tabs on one rib, one behind the other along the chord,
into one line just below the sail, as Ozone's rigging diagrams draw them.
The three-liners have none. Read by name, a pair and the line it hangs from
were all canopy lines, and the two-liners were built with A:31 and A:30 — a
rib for every bridle, where they have 15 and 14 — and came out a third over:
117.6 and 109.2 m a side. The sheets are read by line now
(`resolveBridleLevels`) and the generator builds the pairs (`bridlesPerRow`):
a junction deep enough for the pair to be 0.087 of the rib's chord long on
their mean, on the line from the top line's lower end through the tabs'
centre, so the forward bridle comes out the longer, as on every pair of the
sheets.

Built with fifteen A ribs and no bridles the Alpina comes to +9%; the
bridles add 1.8 m a side, net of the shorter lines they hang from. What is
left is not one level: the two-liners' real mains are shorter and their
middles more, and the Ultralite's real junctions sit lower than any default.

**The brakes.** Built as the pipeline builds them — 13 anchors on 6 and 3
middles on one main line, on every wing, at the law's line height — they come
within 7% of the sheets' on the Geo 7 (+3 to +5%), Ultralite 5 (−6 to +1%),
Alpina 5 (−7 to −6%) and Lynx 2 (+6%), and 14% over on the Zeno 2. They ran
29 to 58% over (Geo 7 +41 to +44%, Ultralite 5 +30 to +39%, Alpina 5 +29 to
+30%, Lynx 2 +46 to +47%, Zeno 2 +58% against its sheet as now read) with the
first junction at the pulley and three lines a side run down to it, where
every sheet has one main line from the handle up past the pulley
(`docs/brakes.md`). What an Ozone family carries over its published total now
is its suspension: within 8% on the three-liners, 10 to 12% over on the
two-liners. The Lynx 2's suspension is 27% over its sheets: its middles carry
top lines of two rows, and B and C split a level, which the generator pairs.

**Density is the constraint kept**, because density sets the loads and the
loads size the lines. Solved to the published length instead, a two-liner
lands on it, by using fewer anchors than the real wing has. Right metres, a
sparser wing, and each line carrying more of the load. The length follows
and is reported.

**Each wing flies in its arc**, as the interface flies it: the lattice's
ratios of the wing as built against itself laid flat (`arcFactors`), which
leave it 0.72 to 0.79 of the flat wing's lift slope. **Minimum sink runs
0.845 to 1.308 m/s** over the 55, the lowest the Skywalk SAGE 75 (0.845), the
PHI Allegro light XS (0.848) and the Niviuk Artik R 2 20 (0.865). None is
under the 0.7 floor. (Flat they ran 0.772 to 1.175; two wings at 0.69 m/s
were reported here when the polar was not capped at the usable lift
coefficient.) Trim speed runs 39.2 to 53.8 km/h on the handbook's typed Cz
of 0.90 at 6°, glide 8.68 to 10.66, and the lightest are the smallest sizes
of light wings at about 3 kg/m², as they should be.

**Every line of every wing is sized**, from the full catalogue the interface
offers. The Zeno 2 L, which could not size one line, sizes all of them since
the merged-cascade and per-line load fixes.

---

## 6. The polar fed back into the balance

Chapter 4's equilibrium took lift, moment and the Oswald factor as typed-in
numbers, while `aero.js` computed all three from the section and planform. The
two were never connected, so **changing the section changed nothing about the
trim**.

`solveEquilibriumFromWing` closes it in the core: Cz from the section's lift
slope and zero-lift angle, Cm0 from the section, the Oswald factor from
lifting line over the real planform. On the suite's wing (11.6 m span, 2.45 m
root, 0.55 m tip, 1.4 m sweep, 90 kg, 6°):

| section | Cz | Cm0 | trim | glide | calage |
| --- | --- | --- | --- | --- | --- |
| NACA 4412 | 1.114 | −0.1062 | 33.8 km/h | 10.18 | 0.445 |
| NACA 4415 | 1.114 | −0.1062 | 33.8 km/h | 10.18 | 0.445 |
| NACA 2414 | 0.886 | −0.0531 | 37.8 km/h | 9.75 | 0.416 |
| NACA 23015 | 0.778 | −0.0128 | 40.4 km/h | 9.31 | 0.370 |
| NACA 23115 | 0.741 | +0.0011 | 41.4 km/h | 9.11 | 0.350 |

Dropping camber from 4% to 2% moves trim speed by **4 km/h** and the calage
by three points of chord — which it should, and previously did not. The
4412 and the 4415 share a mean line, and the theory is worked on it: taken
off the mean of their surfaces they differed by their thickness, −0.1055
and −0.1052. The five-digit sections carry their camber far forward and
little moment, the reflexed 23115 none, and trim faster on it. (The
table here had Cz 1.079 and Cm0 −0.0948 for the 4412; Cz and Cm0 come from
the section alone, so those two columns were out whatever wing they were
made on. Its calages were 0.506 to 0.508 and 0.455 until the balance stopped
counting the pitching moment twice, `docs/departures.md` §5.)

**The interface flies it on the polar.** Its balance, by default, takes the
lift, the induced and profile drag at the angle from the wing's own polar and
the section's Cm0, so changing the section changes the trim, and puts each
force where it acts (`balanceWhereForcesAct`, `docs/balance.md`); in
brackets, the calage on the handbook's rules for where they act
(`balanceOnPolar`). On the default wing at 5°:

| section | in its arc | flat |
| --- | --- | --- |
| NACA 4415 | 35.16 km/h, glide 8.10, calage 42.32% (39.74%) | 32.01 km/h, 8.64, 42.12% (37.52%) |
| NACA 4412 | 35.16 km/h, 8.16, 42.49% (39.98%) | 32.01 km/h, 8.71, 42.31% (37.75%) |
| NACA 2414 | 38.86 km/h, 8.00, 39.25% (35.02%) | 35.50 km/h, 8.72, 40.08% (34.34%) |
| NACA 0012 | 44.03 km/h, 7.46, 32.75% (25.83%) | 40.44 km/h, 8.30, 34.85% (27.29%) |

Where each acts, camber moves the calage two thirds as far as on the
rules — 9.6 points from the NACA 4415 to the 0012 in the arc, where the
rules say 13.9 — because the rule carries the section's moment on the
central chord and the lattice on each strip's own, smaller outboard. On the symmetric section the lift's line is
3.3 points of chord aft of the quarter chord in the arc and 5.8 flat, where
the planform's quarter-chord line runs back toward the tips.

Set to the handbook's typed "Cz at alpha" (0.90), "Cm" (−0.042) and "Oswald
e" (0.90), the section changes nothing but the arc's induced drag at its own
zero-lift angle: 41.99 km/h, glide 7.50 to 7.52 and a calage of 29.73 to
29.81% in the wing's arc, 37.69, 8.48 and 31.38% flown flat. The balance
table shows the polar's span efficiency beside the typed one there (0.960 on
the default wing flat, 0.814 in its arc on the flat span).

### Two mistakes worth recording

**It does not iterate, and my first version did.** `solveEquilibrium` *takes*
the angle of attack; it solves for the calage, not for a trim angle. A version
written to iterate to a fixed point reported "converged in 1 iteration"
because the field it watched did not exist. **A loop that always exits
immediately is worse than no loop: it looks like convergence.**

**Every speed came back NaN**, because the coupling passed `rho: undefined`
when given no atmosphere. A destructuring default fires on an *absent* key,
not on an explicit `undefined`. This is the same trap that let
`RISER_LAYOUTS['A/B']` become the default layout, running the other way: there
a bad value was absorbed, here a good default was defeated.
