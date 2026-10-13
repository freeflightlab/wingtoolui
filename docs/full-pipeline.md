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
size that publishes a projected span.

## 2. Anchor density was driven by cell count, inverting the real relationship

Across the seven published families, line consumption per metre of span
correlates with aspect ratio at **r = −0.966** (the first size of each family
that publishes a total). A high-aspect wing has *more* cells and *less* line:
the Zeno 2 has 78 cells and 15.5 m per metre of span, the Ultralite 5 has 34
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
ways: a design whose line sheets are on file with its own rows, riser count
and anchor counts; any other with `anchorsForLineLength`, which solves the
anchor density to the published line total inside the densities real wings
use (0.28 to 0.94 of the ribs on the front row, measured on twenty designs).
The relationship holds: 0.00864 of line drag for the three lowest aspect
ratios against 0.00782 for the three highest.

**The interface was not part of that fix.** Its derived plan still attaches
every second rib. On its own default wing that is a real wing's density — 13
anchors on 25 ribs, against a measured median of 0.54 — and 316 m of line
against the 273 m real wings of its span and aspect ratio carry. On a
published wing loaded from the picker it is not: a Zeno 2 S came out with
425 m of line against its published 186. The Lines panel now has **Solve
anchors to the line length**, which runs the same solve against the
published total (or, on a wing of the designer's own, against the
aspect-ratio law), and writes the counts out as a cascade the designer can
read and edit. On a Geo 7 MS it gives 263 m against 263.5; on an Alpina 5 ML
on two risers, 230 against 229.7. Under a three-riser layout a two-liner's
total is below anything a real density gives, and the solve says so and names
the layout as the cause rather than the ribs.

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
| all | 55 | +7% | −21 to +43% |
| own rows and anchors, three risers | 12 | +4% | −7 to +13% |
| own rows and anchors, two risers | 10 | +35% | +30 to +43% |
| density solved, three risers | 17 | +1% | −21 to +8% |
| density solved, two risers | 16 | 0% | −2 to +2% |

Twelve of the 33 density-solved wings are still over at the sparsest a real
wing is, and five under at the densest. The five are Niviuk's single-skins,
the Skin 4 P and the Bi Skin 2 P, built here as four rows where the real wings
have nine.

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

Built with its own anchors and line height, against its own sheet, per side
and without the brakes:

| | total | uppers | middles | mains |
| --- | --- | --- | --- | --- |
| Geo 7 MS | 118.0 / 110.0 m (+7%) | 617 / 482 mm | 1936 / 1663 mm | 3817 / 3874 mm |
| Ultralite 5 19 | 102.6 / 111.7 m (−8%) | 471 / 848 | 1592 / 827 | 3099 / 3270 |
| Alpina 5 ML | 117.6 / 89.1 m (+32%) | 550 / 573 | 2036 / 1277 | 4078 / 2867 |
| Zeno 2 ML | 109.2 / 81.6 m (+34%) | 658 / 672 | 2128 / 886 | 4333 / 3876 |

The three-liners are within a tenth, with their surplus and deficit in
different places — the Ultralite's real junctions sit lower than any default.
The two-liners are a third over, and the table says where: the top lines
match, and the middles are two to two and a half times as long.

That is a level the generator does not have. **Each of the three Ozone
two-liners carries sixteen short bridles a side** — A1a and A1b to A8a and
A8b on the Alpina 5 ML, 173 to 228 mm — in pairs that gather two neighbouring
A attachments into one top line just below the sail. The three-liners have
none. On a two-liner's front row a path from the sail starts with a bridle,
so it is a line deeper than the three levels the generator builds: what the
sheet's names call the middle level holds two physical levels, so its mean is
short, and the generator spans the same height with one line.

This section used to say the opposite twice. First that real wings run a
fourth level the generator lacks; then, counting the levels by their names,
that all five reference wings run exactly three and the generator is not
missing anything. The names count three because a bridle pair and the line
it hangs from are both A lines. Reading the sheets by line, the first claim
was right for the two-liners and wrong for the three-liners.

**Density is the constraint kept**, because density sets the loads and the
loads size the lines. Solved to the published length instead, a two-liner on
two risers lands within 2% — by using fewer anchors than the real wing (the
Zeno 2: A11 on the interface's solve against its 30). Right metres, a sparser
wing, and each line carrying more of the load. The length follows and is
reported; building the bridle level is the open item.

**Minimum sink runs 0.772 to 1.175 m/s** over the 55, the lowest the Skywalk
SAGE 75 (0.772), the PHI Allegro light XS (0.775) and the Geo 7 XS (0.780).
None is under the 0.7 floor. (Two wings at 0.69 m/s were reported here when
the polar was not capped at the usable lift coefficient.) Trim speed runs 33.2
to 47.5 km/h, glide 9.85 to 12.29, and the lightest are the smallest sizes
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
| NACA 4412 | 1.122 | −0.1055 | 33.6 km/h | 10.19 | 0.508 |
| NACA 4415 | 1.127 | −0.1052 | 33.6 km/h | 10.19 | 0.506 |
| NACA 2414 | 0.892 | −0.0526 | 37.7 km/h | 9.77 | 0.455 |

Dropping camber from 4% to 2% moves trim speed by **4 km/h** and the calage
by a tenth of itself — which it should, and previously did not. (The table
here had Cz 1.079 and Cm0 −0.0948 for the 4412; Cz and Cm0 come from the
section alone, so those two columns were out whatever wing they were made
on.)

**The interface does not use it.** Its balance is the handbook's, from the
typed "Cz at alpha" (0.90), "Cm" (−0.042) and "Oswald e" (0.90), and changing
the section there still changes nothing about the trim: 37.69 km/h, glide 8.48
and calage 34.19% with NACA 4415, 4412, 2414 or 0012. The polar beside it is
the section's. The balance table now shows the planform's own Oswald factor
next to the typed one (0.960 on the default wing) so the two can be compared;
taking the coupled solve into the interface is an open item, not a claim.

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
