# Chord fraction is not array index

Four places in this project interpolated along a rib surface by **array
index** while their callers passed a **chord fraction**.

Points are spread along the *surface*, and the nose carries far more surface
per unit chord than the flat middle, so the two never agree. The first was
found by accident, the next two by looking for the pattern, and the fourth a
long time later by looking again.

## The billow was applied a tenth of a chord too far aft

Ovalization spread its billow profile using `t = i / (n - 1)` — the **point
number**. The transition profile and the chordwise pressure loading are both
defined in **chord fraction**.

Those are only the same if points are spread evenly along the chord, and they
never are: they are spread evenly along the **surface**, and the nose has far
more surface per unit chord than the flat middle.

| point | index fraction | real chord fraction | error |
| --- | --- | --- | --- |
| 4 of 24 | 0.174 | 0.103 | 7.1 pts |
| 8 of 24 | 0.348 | 0.262 | **8.6 pts** |
| 16 of 24 | 0.696 | 0.636 | 6.0 pts |

So the billow peak, and the pressure the billow is derived from, sat about a
tenth of a chord too far aft on every panel this tool has ever cut.

### How it surfaced

Not from the wing. It came out of the CAD export: clustering points at the
nose for a rounder leading edge made ovalization stop easing the two seams in
opposite directions.

The telling part was that the result **stopped converging**. Bowing a panel
outward is geometry, and how much length that adds to a seam is a property of
the shape, not of how many points describe it. With evenly spread points the
error was at least consistent, so the answer looked stable at 0.032% and
−0.024% from 12 points to 320. With clustered points it drifted from 0.08% to
0.14% and both seams lengthened.

A number that changes when you sample more finely is not measuring the thing
it claims to.

### It was not the only one

Having found it once, I looked for the pattern rather than waiting for the
others to show. There were two more, both interpolating along a rib surface
by array index while their callers passed a chord fraction:

| where | what it decides | worst error |
| --- | --- | --- |
| `ovalization.js` | the billow profile and the chordwise pressure | 8.6 points of chord |
| `vribs.js` `pointAt` | where a diagonal attaches | 2.2 points, 37 mm |
| `lineplan.js` `pointOnSurface` | **where every line attaches** | 1.7 points, 37 mm |

The third is the one that matters most: it places the anchors that carry the
whole wing. The A row at 8.5% chord was landing at 6.8%.

### A fourth, and what "chord" has to mean

Those two were corrected by projecting each point onto the line from a
surface's first point to its last. That *was* the chord line. It stopped being
one when the surfaces were split at the section's foremost point, so that
points could be gathered round the nose: a cambered section's foremost point
is ahead of and above its own x = 0 — 1.05 mm ahead and 9.8 mm up on a 2.27 m
NACA 4415 rib — and the line from there to the trailing edge is not the chord.

So every anchor and every diagonal sat 0.06% of chord forward of where it was
set: 1.4 mm on that rib. Small, and not where the rib openings, which measure
along the chord, were keeping clear of, nor where the slider said.

And the pattern had not been looked for hard enough. A fourth copy, in
`canopyAnchors` — the handbook's own chapter 8 cascade — still went by array
index. With points gathered at the nose, as they are now, index and chord
disagree by up to 22 points of chord on that rib.

There is one function now, `ribSurfacePoint`, and all four use it. It takes
the station in the rib's own plane, along its chord line, and it is exact:
asked 8.5%, 30%, 53% and 78% it lands there to nine decimals, on both
surfaces, at all 52 anchors of a line plan and all 52 of the cascade.

### The fix, and the test

`t` is now the chord fraction of each point, found by projecting it onto the
line from the first point to the last — the chord of the developed seam.

Uniform and clustered sampling now agree to four decimals at every density.
The test asserts both: that the ease converges as sampling improves, and that
two different distributions give the same answer. Restoring the old line fails
it:

```
and two different point distributions agree
  got 0.0323%, expected 0.1389% ± 0.002%
```

---

## Looking for the class, not the instance

Having found the chord-versus-index confusion three times, the same question
applies to units: this project names values after them — `lengthMM`,
`chordM`, `alphaDeg`, `tensionN` — and nothing checked the names were true.

`npm run check:units` compares the suffixes of any two named values combined
with `+`, `-` or a comparison, and looks for a degree value handed straight to
a trig function. **Zero mismatches across 51 unit-bearing comparisons.**

Its first version reported 25, every one of them `MM` against `MM` misread as
`MM` against `M`, because the pattern let `\w+M` swallow the first `M` of a
`MM` suffix. A detector that is entirely noise is worse than none: it teaches
you to skip the output. It compares suffixes properly now, and is verified by
removing a radian conversion and watching it fail.

---

## Three measurements, two of them wrong

Continuing the hunt turned up no more of these — but it did turn up how easy
the measuring is to get wrong.

Checking whether twist actually arrives at the tip:

| attempt | result | what was wrong |
| --- | --- | --- |
| passed `washinDeg` | no response at any setting | the parameter is `washin: {total, mode}` |
| read rise over run in world axes | 2.56° for an asked 4.5° | the rib is tilted; dihedral is in the answer |
| un-rotated the rib first | **4.500° for 4.500°** | — |

The second is the dangerous one. A consistent 58% across every setting looks
exactly like a model delivering a fixed fraction of its input, and it would
have been an entirely plausible bug report. The ruler was tilted.

The fix for measuring it is the same transform the rib view uses to draw a
rib: un-rotate by the rib's own beta, then read the chord line. That is pinned
as a test with the reasoning attached, because the next person to check this
will reach for rise-over-run too.

Also checked and clean: every rib surface runs nose to tail (50 of 50), and
the Selig and Lednicer importers produce the same section from the same
aerofoil.
