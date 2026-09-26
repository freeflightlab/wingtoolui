# Chord fraction is not array index

Three places in this project interpolated along a rib surface by **array
index** while their callers passed a **chord fraction**.

Points are spread evenly along the *surface*, and the nose carries far more
surface per unit chord than the flat middle, so the two never agree. The first
was found by accident; the other two by looking for the pattern.

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

All three now project the point onto the chord of the surface — the line from
its first point to its last — and all three are exact: asked 8.5%, 30%, 53%
and 78%, they land at 8.500%, 30.000%, 53.000% and 78.000%.

The projection is monotonic nose to tail, which is what makes the walk valid,
and a test asserts that too.

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
